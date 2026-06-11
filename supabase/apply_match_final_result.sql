-- Registrar marcador final manualmente y puntuar predicciones de un partido.
-- Ejecutar en Supabase SQL Editor después de pulpo_scoring.sql.
-- Solo luisaachavezz o perfiles con is_admin = true.

DO $apply_match_final$
BEGIN
  IF to_regclass('public.matches') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.pick_scores') IS NULL THEN
    RAISE NOTICE '[apply_match_final_result] Faltan tablas; omitiendo.';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.apply_match_final_result(
      p_match_id text,
      p_home_score integer,
      p_away_score integer
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      prof record;
      pick jsonb;
      g record;
      scored_picks integer := 0;
      caller_username text;
    BEGIN
      SELECT lower(trim(replace(coalesce(username, ''), '@', '')))
      INTO caller_username
      FROM public.profiles
      WHERE id = auth.uid();

      IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('error', 'not_authenticated');
      END IF;

      IF caller_username IS DISTINCT FROM 'luisaachavezz' THEN
        RETURN jsonb_build_object('error', 'not_authorized');
      END IF;

      UPDATE public.matches
      SET
        home_score = greatest(0, p_home_score),
        away_score = greatest(0, p_away_score),
        api_status = 'FT',
        status = 'finished',
        updated_at = now()
      WHERE id = p_match_id;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'match_not_found');
      END IF;

      FOR prof IN
        SELECT id, picks
        FROM public.profiles
        WHERE picks IS NOT NULL AND picks <> '{}'::jsonb
      LOOP
        pick := prof.picks -> p_match_id;
        IF pick IS NULL THEN
          CONTINUE;
        END IF;

        SELECT * INTO g
        FROM public._grade_pick(pick, p_home_score, p_away_score);

        INSERT INTO public.pick_scores (
          profile_id, match_id, points_awarded, exact_hit, winner_hit, scored_at
        )
        VALUES (prof.id, p_match_id, g.points_awarded, g.exact_hit, g.winner_hit, now())
        ON CONFLICT (profile_id, match_id) DO UPDATE SET
          points_awarded = excluded.points_awarded,
          exact_hit = excluded.exact_hit,
          winner_hit = excluded.winner_hit,
          scored_at = now();

        scored_picks := scored_picks + 1;
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
        'match_id', p_match_id,
        'home_score', p_home_score,
        'away_score', p_away_score,
        'scored_picks', scored_picks
      );
    END;
    $body$;
  $fn$;

  GRANT EXECUTE ON FUNCTION public.apply_match_final_result(text, integer, integer) TO authenticated;

  RAISE NOTICE '[apply_match_final_result] RPC instalada.';
END;
$apply_match_final$;
