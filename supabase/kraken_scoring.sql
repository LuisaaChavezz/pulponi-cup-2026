-- Kraken: puntuar siempre (aunque hidden=true) pero fuera del leaderboard público.
-- Ejecutar en Supabase SQL Editor. Seguro para re-ejecutar.

-- 1) Ocultar al Kraken del ranking / comunidad visible (sigue acumulando puntos).
UPDATE public.profiles
SET hidden = true
WHERE lower(trim(replace(coalesce(username, ''), '@', ''))) = 'el-kraken'
   OR id = '00000000-0000-0000-0000-000000000001'::uuid;

-- 2) Helper: perfiles que deben recibir puntos al puntuar un partido.
CREATE OR REPLACE FUNCTION public._profile_is_scorable(p public.profiles)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(p.hidden, false) = false
    OR lower(trim(replace(coalesce(p.username, ''), '@', ''))) = 'el-kraken';
$$;

-- 3) score_match (7 args) — producción usa este overload con penales.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

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
SET search_path = public, extensions
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
  target_match_id text;
  mid_official text;
  pick_key text;
BEGIN
  SELECT m.id::text, nullif(trim(coalesce(m.official_id, '')), '')
  INTO target_match_id, mid_official
  FROM public.matches m
  WHERE m.id::text = trim(p_match_id)
     OR m.official_id = trim(p_match_id)
  LIMIT 1;

  IF target_match_id IS NULL THEN
    target_match_id := trim(p_match_id);
  END IF;

  UPDATE public.matches SET
    home_score = p_home_score,
    away_score = p_away_score,
    went_to_penalties = coalesce(p_went_to_penalties, false),
    penalty_winner = p_penalty_winner,
    penalty_home = p_penalty_home,
    penalty_away = p_penalty_away,
    status = 'finished',
    updated_at = NOW()
  WHERE id::text = target_match_id;

  FOR v_profile IN
    SELECT p.id, p.picks, p.username, p.hidden
    FROM public.profiles p
    WHERE p.picks IS NOT NULL
      AND (
        p.picks ? target_match_id
        OR (mid_official IS NOT NULL AND p.picks ? mid_official)
      )
      AND public._profile_is_scorable(p.*)
  LOOP
    pick_key := NULL;

    IF v_profile.picks ? target_match_id THEN
      pick_key := target_match_id;
    ELSIF mid_official IS NOT NULL AND v_profile.picks ? mid_official THEN
      pick_key := mid_official;
    END IF;

    IF pick_key IS NULL THEN
      CONTINUE;
    END IF;

    v_home_pick := nullif(trim(v_profile.picks->pick_key->>'home_pick'), '')::INT;
    v_away_pick := nullif(trim(v_profile.picks->pick_key->>'away_pick'), '')::INT;

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

    v_bonus := 0;
    IF coalesce(p_went_to_penalties, false) THEN
      v_pick_pen_winner := nullif(trim(v_profile.picks->pick_key->>'penalty_winner'), '');
      v_pick_pen_home := CASE
        WHEN trim(coalesce(v_profile.picks->pick_key->>'penalty_home', '')) ~ '^[0-9]+$'
        THEN trim(v_profile.picks->pick_key->>'penalty_home')::INT
        ELSE NULL
      END;
      v_pick_pen_away := CASE
        WHEN trim(coalesce(v_profile.picks->pick_key->>'penalty_away', '')) ~ '^[0-9]+$'
        THEN trim(v_profile.picks->pick_key->>'penalty_away')::INT
        ELSE NULL
      END;

      IF v_pick_pen_winner IS NOT NULL
         AND p_penalty_winner IS NOT NULL
         AND lower(trim(unaccent(v_pick_pen_winner))) = lower(trim(unaccent(p_penalty_winner))) THEN
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
    VALUES (v_profile.id, pick_key, v_points, v_exact_hit, v_winner_hit, NOW())
    ON CONFLICT (profile_id, match_id) DO UPDATE SET
      points_awarded = EXCLUDED.points_awarded,
      exact_hit = EXCLUDED.exact_hit,
      winner_hit = EXCLUDED.winner_hit,
      scored_at = EXCLUDED.scored_at;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.profiles p SET points = (
    SELECT COALESCE(SUM(ps.points_awarded), 0) FROM public.pick_scores ps WHERE ps.profile_id = p.id
  )
  WHERE p.id IN (SELECT profile_id FROM public.pick_scores WHERE match_id IN (target_match_id, coalesce(mid_official, target_match_id)));

  UPDATE public.profiles p SET exacts = (
    SELECT COALESCE(COUNT(*)::integer, 0) FROM public.pick_scores ps WHERE ps.profile_id = p.id AND ps.exact_hit
  )
  WHERE p.id IN (SELECT profile_id FROM public.pick_scores WHERE match_id IN (target_match_id, coalesce(mid_official, target_match_id)));

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

-- 4) Trono Kraken: nunca asignar el badge al Kraken aunque tenga más puntos.
CREATE OR REPLACE FUNCTION public.transfer_kraken_throne_if_needed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_new_elegido uuid;
  v_current_elegido uuid;
  v_previous_username text;
  v_new_username text;
BEGIN
  IF to_regclass('public.user_badges') IS NULL THEN
    RETURN;
  END IF;

  SELECT p.id
  INTO v_new_elegido
  FROM public.profiles p
  WHERE lower(trim(replace(coalesce(p.username, ''), '@', ''))) <> 'el-kraken'
  ORDER BY p.points DESC, p.exacts DESC, p.streak DESC NULLS LAST, p.username ASC NULLS LAST
  LIMIT 1;

  IF v_new_elegido IS NULL THEN
    RETURN;
  END IF;

  SELECT ub.profile_id
  INTO v_current_elegido
  FROM public.user_badges ub
  WHERE ub.badge_id = 'el-elegido'
  LIMIT 1;

  IF v_new_elegido IS NOT DISTINCT FROM v_current_elegido THEN
    RETURN;
  END IF;

  SELECT lower(trim(replace(coalesce(p.username, ''), '@', '')))
  INTO v_previous_username
  FROM public.profiles p
  WHERE p.id = v_current_elegido;

  SELECT lower(trim(replace(coalesce(p.username, ''), '@', '')))
  INTO v_new_username
  FROM public.profiles p
  WHERE p.id = v_new_elegido;

  IF v_new_username IS NULL OR v_new_username = '' THEN
    RETURN;
  END IF;

  DELETE FROM public.user_badges
  WHERE badge_id = 'el-elegido';

  INSERT INTO public.user_badges (profile_id, badge_id, earned_at)
  VALUES (v_new_elegido, 'el-elegido', now())
  ON CONFLICT (profile_id, badge_id) DO UPDATE
    SET earned_at = excluded.earned_at;

  IF to_regclass('public.elegido_history') IS NOT NULL THEN
    INSERT INTO public.elegido_history (previous_username, new_username, transferred_at)
    VALUES (nullif(v_previous_username, ''), v_new_username, now());
  END IF;
END;
$body$;
