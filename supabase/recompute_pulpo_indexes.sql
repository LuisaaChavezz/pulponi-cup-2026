-- Índice Pulpo desde pick_scores + profiles.streak
-- Ejecutar en Supabase SQL Editor después de pulpo_scoring.sql y auto_score_on_match_finish.sql
--
-- Fórmula:
--   exactos     = COUNT(exact_hit) en pick_scores
--   ganadores   = COUNT(winner_hit) en pick_scores
--   total_picks = COUNT(*) en pick_scores
--   racha acumulada = profiles.streak = COUNT(winner_hit) en pick_scores
--   pulpo_index = ROUND((exactos/total×100×0.5) + (ganadores/total×100×0.3) + LEAST(racha×5, 20))

DO $recompute_pulpo$
BEGIN
  IF to_regclass('public.profiles') IS NULL
     OR to_regclass('public.pick_scores') IS NULL THEN
    RAISE NOTICE '[pulpo_index] Faltan profiles o pick_scores; omitiendo.';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public._compute_pulpo_index(
      exactos integer,
      ganadores integer,
      total_picks integer,
      racha integer
    )
    RETURNS integer
    LANGUAGE sql
    IMMUTABLE
    AS $body$
      SELECT CASE
        WHEN coalesce(total_picks, 0) <= 0 THEN 0
        ELSE greatest(0, least(100, round(
          (exactos::numeric / total_picks * 100 * 0.5) +
          (ganadores::numeric / total_picks * 100 * 0.3) +
          least(greatest(coalesce(racha, 0), 0) * 5, 20)
        )::integer))
      END;
    $body$;
  $fn$;

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
      -- Perfil a perfil: compatible con Supabase safeupdate (evita UPDATE masivo sin WHERE).
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

  GRANT EXECUTE ON FUNCTION public.recompute_all_pulpo_indexes() TO authenticated;
  GRANT EXECUTE ON FUNCTION public.recompute_all_pulpo_indexes() TO service_role;

  RAISE NOTICE '[pulpo_index] recompute_all_pulpo_indexes() instalada.';
END;
$recompute_pulpo$;

-- Parche score_finished_match / score_all_finished_matches (si existen)
DO $patch_scoring$
BEGIN
  IF to_regprocedure('public.score_finished_match(text,boolean)') IS NULL THEN
    RAISE NOTICE '[pulpo_index] score_finished_match no existe; ejecuta auto_score_on_match_finish.sql.';
    RETURN;
  END IF;

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
      g record;
      scored_picks integer := 0;
      affected_profiles uuid[] := '{}'::uuid[];
    BEGIN
      SELECT * INTO m FROM public.matches WHERE id = p_match_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'match_not_found', 'match_id', p_match_id);
      END IF;

      IF NOT public._match_is_finished(m.*) THEN
        RETURN jsonb_build_object(
          'skipped', true,
          'reason', 'not_finished',
          'match_id', p_match_id
        );
      END IF;

      FOR prof IN
        SELECT id, picks
        FROM public.profiles
        WHERE picks IS NOT NULL
          AND picks <> '{}'::jsonb
          AND picks ? p_match_id
      LOOP
        pick := prof.picks -> p_match_id;
        IF pick IS NULL THEN
          CONTINUE;
        END IF;

        SELECT * INTO g
        FROM public._grade_pick(pick, m.home_score::integer, m.away_score::integer);

        INSERT INTO public.pick_scores (
          profile_id, match_id, points_awarded, exact_hit, winner_hit, scored_at
        )
        VALUES (
          prof.id, p_match_id, g.points_awarded, g.exact_hit, g.winner_hit, now()
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
          PERFORM public.recompute_all_pulpo_indexes();
        END IF;
      END IF;

      RETURN jsonb_build_object(
        'match_id', p_match_id,
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
        PERFORM public.recompute_all_pulpo_indexes();
      END IF;

      RETURN jsonb_build_object(
        'scored_matches', scored_matches,
        'scored_picks', scored_picks
      );
    END;
    $body$;
  $fn$;

  RAISE NOTICE '[pulpo_index] score_finished_match y score_all_finished_matches parcheadas.';
END;
$patch_scoring$;

-- Backfill inicial (todos los perfiles con pick_scores actuales):
SELECT public.recompute_all_pulpo_indexes();
