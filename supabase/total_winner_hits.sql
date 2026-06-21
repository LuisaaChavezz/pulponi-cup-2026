-- Racha acumulada en perfil: profiles.total_winner_hits = COUNT(winner_hit) en pick_scores.
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_winner_hits integer NOT NULL DEFAULT 0;

UPDATE public.profiles p
SET total_winner_hits = coalesce((
  SELECT count(*)::integer
  FROM public.pick_scores ps
  WHERE ps.profile_id = p.id
    AND ps.winner_hit
), 0);

DO $total_winner_hits$
BEGIN
  IF to_regclass('public.profiles') IS NULL
     OR to_regclass('public.pick_scores') IS NULL THEN
    RAISE NOTICE '[total_winner_hits] Faltan tablas; omitiendo funciones.';
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
        ), 0),
        total_winner_hits = coalesce((
          SELECT count(*)::integer
          FROM public.pick_scores ps
          WHERE ps.profile_id = p.id AND ps.winner_hit
        ), 0)
      WHERE p.id = ANY (p_profile_ids);
    END;
    $body$;
  $fn$;

  IF to_regprocedure('public.score_finished_match(text,boolean)') IS NOT NULL THEN
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
        prior_winner_hit boolean;
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

          prior_winner_hit := false;
          SELECT ps.winner_hit
          INTO prior_winner_hit
          FROM public.pick_scores ps
          WHERE ps.profile_id = prof.id
            AND ps.match_id = pick_key;

          IF NOT FOUND THEN
            prior_winner_hit := false;
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

          IF g.winner_hit AND NOT coalesce(prior_winner_hit, false) THEN
            UPDATE public.profiles
            SET total_winner_hits = coalesce(total_winner_hits, 0) + 1
            WHERE id = prof.id;
          ELSIF NOT g.winner_hit AND coalesce(prior_winner_hit, false) THEN
            UPDATE public.profiles
            SET total_winner_hits = greatest(0, coalesce(total_winner_hits, 0) - 1)
            WHERE id = prof.id;
          END IF;

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
  END IF;

  RAISE NOTICE '[total_winner_hits] Columna y funciones actualizadas.';
END;
$total_winner_hits$;
