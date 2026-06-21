-- Parche admin + racha acumulada
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar).
--
-- 1) recompute_all_pulpo_indexes: UPDATE perfil a perfil (evita "UPDATE requires a WHERE clause"
--    al puntuar desde admin con score_match_by_teams).
-- 2) recompute_profile_streaks: racha consecutiva actual (ranking / desempates).

DO $fix_admin_scoring$
BEGIN
  IF to_regclass('public.profiles') IS NULL
     OR to_regclass('public.pick_scores') IS NULL THEN
    RAISE NOTICE '[fix_admin_scoring] Faltan profiles o pick_scores; omitiendo.';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.recompute_profile_streaks()
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      prof record;
      m record;
      ex_hit boolean;
      win_hit boolean;
      run_streak integer;
    BEGIN
      FOR prof IN SELECT id FROM public.profiles LOOP
        run_streak := 0;

        FOR m IN
          SELECT id::text AS id, kickoff
          FROM public.matches
          WHERE public._match_is_finished(matches.*)
          ORDER BY kickoff ASC NULLS LAST, id ASC
        LOOP
          SELECT ps.exact_hit, ps.winner_hit
          INTO ex_hit, win_hit
          FROM public.pick_scores ps
          WHERE ps.profile_id = prof.id AND ps.match_id = m.id;

          IF NOT FOUND THEN
            run_streak := 0;
            CONTINUE;
          END IF;

          IF ex_hit OR win_hit THEN
            run_streak := run_streak + 1;
          ELSE
            run_streak := 0;
          END IF;
        END LOOP;

        UPDATE public.profiles SET streak = run_streak WHERE id = prof.id;
      END LOOP;
    END;
    $body$;
  $fn$;

  IF to_regprocedure('public._compute_pulpo_index(integer,integer,integer,integer)') IS NULL THEN
    RAISE NOTICE '[fix_admin_scoring] Falta _compute_pulpo_index; ejecuta recompute_pulpo_indexes.sql primero.';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.recompute_all_pulpo_indexes()
    RETURNS integer
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      updated_count integer := 0;
      prof record;
    BEGIN
      FOR prof IN
        SELECT
          p.id,
          p.streak,
          coalesce(agg.total_picks, 0) AS total_picks,
          coalesce(agg.exactos, 0) AS exactos,
          coalesce(agg.ganadores, 0) AS ganadores
        FROM public.profiles p
        LEFT JOIN (
          SELECT
            profile_id,
            count(*)::integer AS total_picks,
            count(*) FILTER (WHERE exact_hit)::integer AS exactos,
            count(*) FILTER (WHERE winner_hit)::integer AS ganadores
          FROM public.pick_scores
          GROUP BY profile_id
        ) agg ON p.id = agg.profile_id
      LOOP
        IF prof.total_picks <= 0 THEN
          UPDATE public.profiles
          SET pulpo_index = 0, pulpo_stats = '{}'::jsonb
          WHERE id = prof.id;
        ELSE
          UPDATE public.profiles
          SET
            pulpo_index = public._compute_pulpo_index(
              prof.exactos,
              prof.ganadores,
              prof.total_picks,
              prof.streak
            ),
            pulpo_stats = jsonb_build_object(
              'computed_at', now(),
              'totalPicks', prof.total_picks,
              'exacts', prof.exactos,
              'winners', prof.ganadores,
              'streak', prof.streak,
              'exactTerm', round(prof.exactos::numeric / prof.total_picks * 100 * 0.5)::integer,
              'winnerTerm', round(prof.ganadores::numeric / prof.total_picks * 100 * 0.3)::integer,
              'streakTerm', least(greatest(prof.streak, 0) * 5, 20)
            )
          WHERE id = prof.id;
        END IF;

        updated_count := updated_count + 1;
      END LOOP;

      RETURN updated_count;
    END;
    $body$;
  $fn$;

  GRANT EXECUTE ON FUNCTION public.recompute_profile_streaks() TO authenticated;
  GRANT EXECUTE ON FUNCTION public.recompute_all_pulpo_indexes() TO authenticated;
  GRANT EXECUTE ON FUNCTION public.recompute_all_pulpo_indexes() TO service_role;

  RAISE NOTICE '[fix_admin_scoring] Funciones parcheadas.';
END;
$fix_admin_scoring$;

-- Backfill: racha consecutiva + índice Pulpo
SELECT public.recompute_profile_streaks();
SELECT public.recompute_all_pulpo_indexes();
