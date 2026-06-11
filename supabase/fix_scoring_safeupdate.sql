-- Parche: Supabase safeupdate exige WHERE en UPDATE masivos de perfiles.
-- Ejecutar en SQL Editor si score_all_finished_matches() falla con
-- "UPDATE requires a WHERE clause".

DO $fix_scoring_updates$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE NOTICE 'profiles no existe; omitiendo.';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.score_all_finished_matches()
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      m record;
      prof record;
      pick jsonb;
      g record;
      mid_text text;
      scored_matches integer := 0;
      scored_picks integer := 0;
    BEGIN
      FOR m IN
        SELECT *
        FROM public.matches
        WHERE public._match_is_finished(matches.*)
      LOOP
        scored_matches := scored_matches + 1;
        mid_text := m.id::text;

        FOR prof IN
          SELECT id, picks
          FROM public.profiles
          WHERE picks IS NOT NULL AND picks <> '{}'::jsonb
        LOOP
          pick := prof.picks -> mid_text;
          IF pick IS NULL THEN
            CONTINUE;
          END IF;

          SELECT * INTO g
          FROM public._grade_pick(pick, m.home_score::integer, m.away_score::integer);

          INSERT INTO public.pick_scores (
            profile_id, match_id, points_awarded, exact_hit, winner_hit, scored_at
          )
          VALUES (prof.id, mid_text, g.points_awarded, g.exact_hit, g.winner_hit, now())
          ON CONFLICT (profile_id, match_id) DO UPDATE SET
            points_awarded = excluded.points_awarded,
            exact_hit = excluded.exact_hit,
            winner_hit = excluded.winner_hit,
            scored_at = now();

          scored_picks := scored_picks + 1;
        END LOOP;
      END LOOP;

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
      WHERE p.id IS NOT NULL;

      PERFORM public.recompute_profile_streaks();

      RETURN jsonb_build_object(
        'scored_matches', scored_matches,
        'scored_picks', scored_picks
      );
    END;
    $body$;
  $fn$;

  RAISE NOTICE 'score_all_finished_matches() parcheada (WHERE en UPDATE profiles).';
END;
$fix_scoring_updates$;

-- México vs Sudáfrica 2-0 (si aún no está FT en matches):
-- UPDATE public.matches SET home_score = 2, away_score = 0, api_status = 'FT', status = 'finished'
-- WHERE lower(home_team) LIKE '%mexico%' AND lower(away_team) LIKE '%sud%';

SELECT public.score_all_finished_matches();
