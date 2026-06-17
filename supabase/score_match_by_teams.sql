-- Puntuar por nombres de equipos (admin): evita desajuste match_id vs profiles.picks.
-- Ejecutar en Supabase SQL Editor después de pulpo_scoring.sql y auto_score_on_match_finish.sql.

DO $score_by_teams$
BEGIN
  IF to_regclass('public.matches') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.pick_scores') IS NULL THEN
    RAISE NOTICE '[score_match_by_teams] Faltan tablas; omitiendo.';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public._normalize_team_name(p_name text)
    RETURNS text
    LANGUAGE sql
    IMMUTABLE
    AS $body$
      SELECT lower(trim(regexp_replace(
        translate(
          coalesce(p_name, ''),
          'ÁÉÍÓÚÜÑáéíóúüñÀÈÌÒÙÂÊÎÔÛÃÕÇàèìòùâêîôûãõç',
          'AEIOUUNaeiouunAEIOUAEIOUAOÇaeiouaeiouaoc'
        ),
        '[^a-z0-9\s]', ' ', 'g'
      )));
    $body$;
  $fn$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public._teams_match_names(
      p_home_a text,
      p_away_a text,
      p_home_b text,
      p_away_b text
    )
    RETURNS boolean
    LANGUAGE sql
    IMMUTABLE
    AS $body$
      SELECT
        public._normalize_team_name(p_home_a) = public._normalize_team_name(p_home_b)
        AND public._normalize_team_name(p_away_a) = public._normalize_team_name(p_away_b)
        OR (
          public._normalize_team_name(p_home_a) = public._normalize_team_name(p_away_b)
          AND public._normalize_team_name(p_away_a) = public._normalize_team_name(p_home_b)
        );
    $body$;
  $fn$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public._pick_key_matches_teams(
      p_pick_key text,
      p_home_team text,
      p_away_team text
    )
    RETURNS boolean
    LANGUAGE plpgsql
    STABLE
    SET search_path = public
    AS $body$
    DECLARE
      ref public.matches%ROWTYPE;
    BEGIN
      IF p_pick_key IS NULL OR trim(p_pick_key) = '' THEN
        RETURN false;
      END IF;

      SELECT * INTO ref
      FROM public.matches
      WHERE id::text = trim(p_pick_key)
         OR official_id = trim(p_pick_key)
      LIMIT 1;

      IF NOT FOUND THEN
        RETURN false;
      END IF;

      RETURN public._teams_match_names(
        ref.home_team,
        ref.away_team,
        p_home_team,
        p_away_team
      );
    END;
    $body$;
  $fn$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.score_match_by_teams(
      p_home_team text,
      p_away_team text,
      p_recompute_streaks boolean DEFAULT true
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      m public.matches%ROWTYPE;
      prof record;
      pick jsonb;
      pick_key text;
      g record;
      scored_picks integer := 0;
      affected_profiles uuid[] := '{}'::uuid[];
      mid_db text;
      mid_official text;
    BEGIN
      IF p_home_team IS NULL OR trim(p_home_team) = ''
         OR p_away_team IS NULL OR trim(p_away_team) = '' THEN
        RETURN jsonb_build_object('error', 'teams_required');
      END IF;

      SELECT * INTO m
      FROM public.matches
      WHERE public._teams_match_names(home_team, away_team, p_home_team, p_away_team)
      ORDER BY kickoff DESC NULLS LAST, id ASC
      LIMIT 1;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'error', 'match_not_found',
          'home_team', p_home_team,
          'away_team', p_away_team
        );
      END IF;

      mid_db := m.id::text;
      mid_official := nullif(trim(coalesce(m.official_id, '')), '');

      FOR prof IN
        SELECT id, picks
        FROM public.profiles
        WHERE picks IS NOT NULL
          AND picks <> '{}'::jsonb
      LOOP
        pick_key := NULL;
        pick := NULL;

        FOR pick_key IN SELECT jsonb_object_keys(prof.picks)
        LOOP
          IF NOT public._pick_key_matches_teams(pick_key, p_home_team, p_away_team) THEN
            CONTINUE;
          END IF;

          pick := prof.picks -> pick_key;
          IF pick IS NULL THEN
            CONTINUE;
          END IF;

          SELECT * INTO g
          FROM public._grade_pick(pick, m.home_score::integer, m.away_score::integer);

          INSERT INTO public.pick_scores (
            profile_id, match_id, points_awarded, exact_hit, winner_hit, scored_at
          )
          VALUES (
            prof.id, pick_key, g.points_awarded, g.exact_hit, g.winner_hit, now()
          )
          ON CONFLICT (profile_id, match_id) DO UPDATE SET
            points_awarded = excluded.points_awarded,
            exact_hit = excluded.exact_hit,
            winner_hit = excluded.winner_hit,
            scored_at = now();

          scored_picks := scored_picks + 1;
          affected_profiles := array_append(affected_profiles, prof.id);
          EXIT;
        END LOOP;
      END LOOP;

      IF scored_picks > 0 THEN
        PERFORM public._recompute_profiles_from_pick_scores(affected_profiles);
        IF p_recompute_streaks THEN
          PERFORM public.recompute_profile_streaks();
          IF to_regprocedure('public.recompute_all_pulpo_indexes()') IS NOT NULL THEN
            PERFORM public.recompute_all_pulpo_indexes();
          END IF;
        END IF;
      END IF;

      RETURN jsonb_build_object(
        'match_id', mid_db,
        'home_team', m.home_team,
        'away_team', m.away_team,
        'home_score', m.home_score,
        'away_score', m.away_score,
        'scored_picks', scored_picks,
        'via', 'score_match_by_teams'
      );
    END;
    $body$;
  $fn$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.apply_match_final_result_by_teams(
      p_home_team text,
      p_away_team text,
      p_home_score integer,
      p_away_score integer
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      caller_username text;
      caller_is_admin boolean;
      target_match_id text;
      score_result jsonb;
    BEGIN
      SELECT
        lower(trim(replace(coalesce(username, ''), '@', ''))),
        coalesce(is_admin, false)
      INTO caller_username, caller_is_admin
      FROM public.profiles
      WHERE id = auth.uid();

      IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('error', 'not_authenticated');
      END IF;

      IF caller_username IS DISTINCT FROM 'luisaachavezz' AND NOT caller_is_admin THEN
        RETURN jsonb_build_object('error', 'not_authorized');
      END IF;

      SELECT id::text
      INTO target_match_id
      FROM public.matches
      WHERE public._teams_match_names(home_team, away_team, p_home_team, p_away_team)
      ORDER BY kickoff DESC NULLS LAST, id ASC
      LIMIT 1;

      IF target_match_id IS NULL THEN
        RETURN jsonb_build_object(
          'error', 'match_not_found',
          'home_team', p_home_team,
          'away_team', p_away_team
        );
      END IF;

      UPDATE public.matches
      SET
        home_score = greatest(0, p_home_score),
        away_score = greatest(0, p_away_score),
        api_status = 'FT',
        status = 'finished',
        updated_at = now()
      WHERE id::text = target_match_id;

      score_result := public.score_match_by_teams(p_home_team, p_away_team, true);

      RETURN score_result
        || jsonb_build_object(
          'match_id', target_match_id,
          'home_score', p_home_score,
          'away_score', p_away_score,
          'via', 'admin_rpc_by_teams'
        );
    END;
    $body$;
  $fn$;

  GRANT EXECUTE ON FUNCTION public.score_match_by_teams(text, text, boolean) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.score_match_by_teams(text, text, boolean) TO service_role;
  GRANT EXECUTE ON FUNCTION public.apply_match_final_result_by_teams(text, text, integer, integer) TO authenticated;

  RAISE NOTICE '[score_match_by_teams] RPCs instaladas.';
END;
$score_by_teams$;
