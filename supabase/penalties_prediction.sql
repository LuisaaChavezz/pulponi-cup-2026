-- Pulponi Cup — Predicción de penales en partidos de eliminación directa.
-- Ejecutar en Supabase → SQL Editor. Seguro para re-ejecutar.
--
-- Reglas de puntuación de penales (solo si went_to_penalties = true):
--   +1 si acertó al ganador de la tanda (penalty_winner)
--   +1 si acertó el marcador exacto de penales (penalty_home / penalty_away)
-- Estos puntos se SUMAN a los puntos del marcador de 90' (3 exacto / 1 ganador / 0).

-- 1) Columnas de marcador de penales (is_knockout / went_to_penalties / penalty_winner ya existen).
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS penalty_home integer;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS penalty_away integer;

-- 2) RPC score_match con parámetros opcionales de penales (overload de 7 args).
--    Autocontenida e idempotente: re-calcula base + bono de penales en cada corrida.
CREATE OR REPLACE FUNCTION public.score_match(
  p_match_id text,
  p_home_score integer,
  p_away_score integer,
  p_went_to_penalties boolean DEFAULT false,
  p_penalty_winner text DEFAULT null,
  p_penalty_home integer DEFAULT null,
  p_penalty_away integer DEFAULT null
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_profile RECORD;
  v_home_pick INT;
  v_away_pick INT;
  v_exact_hit BOOLEAN;
  v_winner_hit BOOLEAN;
  v_points INT;
  v_bonus INT;
  v_pick_pen_winner TEXT;
  v_pick_pen_home INT;
  v_pick_pen_away INT;
  v_count INT := 0;
BEGIN
  UPDATE public.matches SET
    home_score = p_home_score,
    away_score = p_away_score,
    went_to_penalties = coalesce(p_went_to_penalties, false),
    penalty_winner = p_penalty_winner,
    penalty_home = p_penalty_home,
    penalty_away = p_penalty_away,
    status = 'finished',
    updated_at = NOW()
  WHERE id = p_match_id;

  FOR v_profile IN
    SELECT id, picks FROM public.profiles WHERE picks ? p_match_id
  LOOP
    v_home_pick := nullif(trim(v_profile.picks->p_match_id->>'home_pick'), '')::INT;
    v_away_pick := nullif(trim(v_profile.picks->p_match_id->>'away_pick'), '')::INT;

    IF v_home_pick IS NULL OR v_away_pick IS NULL THEN
      CONTINUE;
    END IF;

    v_exact_hit := (v_home_pick = p_home_score AND v_away_pick = p_away_score);
    v_winner_hit := (
      (v_home_pick > v_away_pick AND p_home_score > p_away_score) OR
      (v_home_pick < v_away_pick AND p_home_score < p_away_score) OR
      (v_home_pick = v_away_pick AND p_home_score = p_away_score)
    );

    IF v_exact_hit THEN v_points := 3;
    ELSIF v_winner_hit THEN v_points := 1;
    ELSE v_points := 0;
    END IF;

    -- Bono de penales
    v_bonus := 0;
    IF coalesce(p_went_to_penalties, false) THEN
      v_pick_pen_winner := nullif(trim(v_profile.picks->p_match_id->>'penalty_winner'), '');
      v_pick_pen_home := CASE
        WHEN (v_profile.picks->p_match_id->>'penalty_home') ~ '^[0-9]+$'
        THEN (v_profile.picks->p_match_id->>'penalty_home')::INT END;
      v_pick_pen_away := CASE
        WHEN (v_profile.picks->p_match_id->>'penalty_away') ~ '^[0-9]+$'
        THEN (v_profile.picks->p_match_id->>'penalty_away')::INT END;

      IF v_pick_pen_winner IS NOT NULL
         AND p_penalty_winner IS NOT NULL
         AND lower(trim(v_pick_pen_winner)) = lower(trim(p_penalty_winner)) THEN
        v_bonus := v_bonus + 1;
      END IF;

      IF v_pick_pen_home IS NOT NULL AND v_pick_pen_away IS NOT NULL
         AND p_penalty_home IS NOT NULL AND p_penalty_away IS NOT NULL
         AND v_pick_pen_home = p_penalty_home
         AND v_pick_pen_away = p_penalty_away THEN
        v_bonus := v_bonus + 1;
      END IF;
    END IF;

    v_points := v_points + v_bonus;

    INSERT INTO public.pick_scores (profile_id, match_id, points_awarded, exact_hit, winner_hit, scored_at)
    VALUES (v_profile.id, p_match_id, v_points, v_exact_hit, v_winner_hit, NOW())
    ON CONFLICT (profile_id, match_id) DO UPDATE SET
      points_awarded = EXCLUDED.points_awarded,
      exact_hit = EXCLUDED.exact_hit,
      winner_hit = EXCLUDED.winner_hit,
      scored_at = EXCLUDED.scored_at;

    v_count := v_count + 1;
  END LOOP;

  -- Re-sumar puntos totales de los perfiles afectados
  UPDATE public.profiles p SET points = (
    SELECT COALESCE(SUM(ps.points_awarded), 0) FROM public.pick_scores ps WHERE ps.profile_id = p.id
  )
  WHERE p.id IN (SELECT profile_id FROM public.pick_scores WHERE match_id = p_match_id);

  -- Recalcular rachas y pulpo index si las RPC existen
  IF to_regprocedure('public.recompute_profile_streaks()') IS NOT NULL THEN
    PERFORM public.recompute_profile_streaks();
  END IF;
  IF to_regprocedure('public.recompute_all_pulpo_indexes()') IS NOT NULL THEN
    PERFORM public.recompute_all_pulpo_indexes();
  END IF;

  RETURN format('✅ %s picks puntuados (penales: %s).', v_count, coalesce(p_went_to_penalties, false));
END;
$body$;

GRANT EXECUTE ON FUNCTION public.score_match(text, integer, integer, boolean, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.score_match(text, integer, integer, boolean, text, integer, integer) TO service_role;
