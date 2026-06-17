-- Puntuar por equipos + marcador (admin): resuelve pick keys en profiles.picks.
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
      p_home_score integer,
      p_away_score integer
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
      target_match_id text;
      fh integer;
      fa integer;
    BEGIN
      IF p_home_team IS NULL OR trim(p_home_team) = ''
         OR p_away_team IS NULL OR trim(p_away_team) = '' THEN
        RETURN jsonb_build_object('error', 'teams_required');
      END IF;

      fh := greatest(0, coalesce(p_home_score, 0));
      fa := greatest(0, coalesce(p_away_score, 0));

      SELECT id::text
      INTO target_match_id
      FROM public.matches
      WHERE public._teams_match_names(home_team, away_team, p_home_team, p_away_team)
      ORDER BY kickoff DESC NULLS LAST, id ASC
      LIMIT 1;

      IF target_match_id IS NULL THEN
        SELECT id::text
        INTO target_match_id
        FROM public.matches m
        WHERE EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.picks IS NOT NULL
            AND p.picks <> '{}'::jsonb
            AND EXISTS (
              SELECT 1
              FROM jsonb_object_keys(p.picks) AS k(key)
              WHERE k.key IN (m.id::text, coalesce(m.official_id, ''))
            )
        )
        AND public._teams_match_names(m.home_team, m.away_team, p_home_team, p_away_team)
        ORDER BY m.kickoff DESC NULLS LAST, m.id ASC
        LIMIT 1;
      END IF;

      IF target_match_id IS NOT NULL THEN
        UPDATE public.matches
        SET
          home_score = fh,
          away_score = fa,
          api_status = 'FT',
          status = 'finished',
          updated_at = now()
        WHERE id::text = target_match_id;

        SELECT * INTO m FROM public.matches WHERE id::text = target_match_id;
      END IF;

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

          SELECT * INTO g FROM public._grade_pick(pick, fh, fa);

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
        PERFORM public.recompute_profile_streaks();
        IF to_regprocedure('public.recompute_all_pulpo_indexes()') IS NOT NULL THEN
          PERFORM public.recompute_all_pulpo_indexes();
        END IF;
      END IF;

      RETURN jsonb_build_object(
        'match_id', coalesce(target_match_id, m.id::text),
        'home_team', coalesce(m.home_team, p_home_team),
        'away_team', coalesce(m.away_team, p_away_team),
        'home_score', fh,
        'away_score', fa,
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

      score_result := public.score_match_by_teams(
        p_home_team,
        p_away_team,
        p_home_score,
        p_away_score
      );

      RETURN score_result || jsonb_build_object('via', 'admin_rpc_by_teams');
    END;
    $body$;
  $fn$;

  GRANT EXECUTE ON FUNCTION public.score_match_by_teams(text, text, integer, integer) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.score_match_by_teams(text, text, integer, integer) TO service_role;
  GRANT EXECUTE ON FUNCTION public.apply_match_final_result_by_teams(text, text, integer, integer) TO authenticated;

  RAISE NOTICE '[score_match_by_teams] RPCs instaladas (home_team, away_team, home_score, away_score).';
END;
$score_by_teams$;
