-- Puntuación automática al finalizar un partido (trigger + RPC por match_id).
-- Ejecutar en Supabase SQL Editor después de pulpo_scoring.sql y fix_scoring_safeupdate.sql.
-- Reglas: 3 pts exacto, 1 pt ganador, 0 si falla. UPSERT en pick_scores.

DO $auto_score$
BEGIN
  IF to_regclass('public.matches') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.pick_scores') IS NULL THEN
    RAISE NOTICE '[auto_score] Faltan tablas; omitiendo.';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public._recompute_profiles_from_pick_scores(p_profile_ids uuid[])
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    BEGIN
      IF p_profile_ids IS NULL OR array_length(p_profile_ids, 1) IS NULL THEN
        RETURN;
      END IF;

      UPDATE public.profiles p SET
        points = coalesce((
          SELECT sum(ps.points_awarded)::integer
          FROM public.pick_scores ps
          WHERE ps.profile_id = p.id
        ), 0),
        exacts = coalesce((
          SELECT count(*)::integer
          FROM public.pick_scores ps
          WHERE ps.profile_id = p.id AND ps.exact_hit
        ), 0)
      WHERE p.id = ANY (p_profile_ids);
    END;
    $body$;
  $fn$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.score_finished_match(
      p_match_id text,
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
      SELECT * INTO m
      FROM public.matches
      WHERE id::text = trim(p_match_id)
         OR official_id = trim(p_match_id)
      LIMIT 1;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'match_not_found', 'match_id', p_match_id);
      END IF;

      mid_db := m.id::text;
      mid_official := nullif(trim(coalesce(m.official_id, '')), '');

      IF NOT public._match_is_finished(m.*) THEN
        RETURN jsonb_build_object(
          'skipped', true,
          'reason', 'not_finished',
          'match_id', mid_db
        );
      END IF;

      FOR prof IN
        SELECT id, picks
        FROM public.profiles
        WHERE picks IS NOT NULL
          AND picks <> '{}'::jsonb
          AND (
            picks ? mid_db
            OR (mid_official IS NOT NULL AND picks ? mid_official)
          )
      LOOP
        pick_key := NULL;
        pick := NULL;

        IF prof.picks ? mid_db THEN
          pick_key := mid_db;
          pick := prof.picks -> mid_db;
        ELSIF mid_official IS NOT NULL AND prof.picks ? mid_official THEN
          pick_key := mid_official;
          pick := prof.picks -> mid_official;
        END IF;

        IF pick IS NULL OR pick_key IS NULL THEN
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

      IF scored_picks > 0
         AND to_regprocedure('public.transfer_kraken_throne_if_needed()') IS NOT NULL THEN
        PERFORM public.transfer_kraken_throne_if_needed();
      END IF;

      RETURN jsonb_build_object(
        'match_id', mid_db,
        'home_score', m.home_score,
        'away_score', m.away_score,
        'scored_picks', scored_picks
      );
    END;
    $body$;
  $fn$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.score_all_finished_matches()
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      m record;
      mid_text text;
      scored_matches integer := 0;
      scored_picks integer := 0;
      one jsonb;
    BEGIN
      FOR m IN
        SELECT id
        FROM public.matches
        WHERE public._match_is_finished(matches.*)
        ORDER BY kickoff ASC NULLS LAST, id ASC
      LOOP
        mid_text := m.id::text;
        one := public.score_finished_match(mid_text, false);
        scored_matches := scored_matches + 1;
        scored_picks := scored_picks + coalesce((one->>'scored_picks')::integer, 0);
      END LOOP;

      IF scored_picks > 0 THEN
        PERFORM public.recompute_profile_streaks();
        IF to_regprocedure('public.recompute_all_pulpo_indexes()') IS NOT NULL THEN
          PERFORM public.recompute_all_pulpo_indexes();
        END IF;
      END IF;

      RETURN jsonb_build_object(
        'scored_matches', scored_matches,
        'scored_picks', scored_picks
      );
    END;
    $body$;
  $fn$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.trg_matches_auto_score()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    BEGIN
      IF NEW.home_score IS NULL OR NEW.away_score IS NULL THEN
        RETURN NEW;
      END IF;

      IF NOT public._match_is_finished(NEW.*) THEN
        RETURN NEW;
      END IF;

      IF TG_OP = 'UPDATE' THEN
        IF OLD.home_score IS NOT DISTINCT FROM NEW.home_score
           AND OLD.away_score IS NOT DISTINCT FROM NEW.away_score
           AND OLD.status IS NOT DISTINCT FROM NEW.status
           AND OLD.api_status IS NOT DISTINCT FROM NEW.api_status
           AND public._match_is_finished(OLD.*) THEN
          RETURN NEW;
        END IF;
      END IF;

      PERFORM public.score_finished_match(NEW.id::text, true);
      RETURN NEW;
    END;
    $body$;
  $fn$;

  DROP TRIGGER IF EXISTS matches_auto_score_on_result ON public.matches;

  CREATE TRIGGER matches_auto_score_on_result
    AFTER UPDATE OF home_score, away_score, status, api_status
    ON public.matches
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_matches_auto_score();

  GRANT EXECUTE ON FUNCTION public.score_finished_match(text, boolean) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.score_finished_match(text, boolean) TO service_role;
  GRANT EXECUTE ON FUNCTION public.score_all_finished_matches() TO authenticated;
  GRANT EXECUTE ON FUNCTION public.score_all_finished_matches() TO service_role;

  RAISE NOTICE '[auto_score] score_finished_match + trigger matches_auto_score_on_result instalados.';
END;
$auto_score$;

-- Puntúa todos los partidos ya finalizados (idempotente):
-- SELECT public.score_all_finished_matches();
