-- Re-puntuar un partido ya calificado con marcador corregido.
-- Ejecutar después de pulpo_scoring.sql, auto_score_on_match_finish.sql y apply_match_final_result.sql.

DO $rescore_match$
BEGIN
  IF to_regclass('public.matches') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.pick_scores') IS NULL THEN
    RAISE NOTICE '[rescore_match] Faltan tablas; omitiendo.';
    RETURN;
  END IF;

  EXECUTE $fn$
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
  $fn$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.score_match(
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
      target_match_id text;
      score_result jsonb;
    BEGIN
      IF p_match_id IS NULL OR trim(p_match_id) = '' THEN
        RETURN jsonb_build_object('error', 'match_id_required');
      END IF;

      SELECT id::text
      INTO target_match_id
      FROM public.matches
      WHERE id::text = trim(p_match_id)
         OR official_id = trim(p_match_id)
      LIMIT 1;

      IF target_match_id IS NULL THEN
        RETURN jsonb_build_object('error', 'match_not_found', 'match_id', p_match_id);
      END IF;

      UPDATE public.matches
      SET
        home_score = greatest(0, coalesce(p_home_score, 0)),
        away_score = greatest(0, coalesce(p_away_score, 0)),
        api_status = 'FT',
        status = 'finished',
        updated_at = now()
      WHERE id::text = target_match_id;

      score_result := public.score_finished_match(target_match_id, true);

      -- Trono Kraken: transferir al #1 automáticamente
      PERFORM public.transfer_kraken_throne_if_needed();

      RETURN score_result
        || jsonb_build_object(
          'match_id', target_match_id,
          'home_score', greatest(0, coalesce(p_home_score, 0)),
          'away_score', greatest(0, coalesce(p_away_score, 0)),
          'via', 'score_match'
        );
    END;
    $body$;
  $fn$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.rescore_match(
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
      m public.matches%ROWTYPE;
      mid_db text;
      mid_official text;
      prior_count integer;
      score_result jsonb;
    BEGIN
      IF p_match_id IS NULL OR trim(p_match_id) = '' THEN
        RETURN jsonb_build_object('error', 'match_id_required');
      END IF;

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

      SELECT count(*)::integer
      INTO prior_count
      FROM public.pick_scores ps
      WHERE ps.match_id = mid_db
         OR (mid_official IS NOT NULL AND ps.match_id = mid_official);

      IF coalesce(prior_count, 0) = 0 THEN
        RETURN jsonb_build_object('error', 'no_previous_scores', 'match_id', mid_db);
      END IF;

      UPDATE public.profiles p
      SET
        points = greatest(0, p.points - ps.points_awarded),
        exacts = greatest(0, p.exacts - CASE WHEN ps.exact_hit THEN 1 ELSE 0 END),
        total_winner_hits = greatest(0, p.total_winner_hits - CASE WHEN ps.winner_hit THEN 1 ELSE 0 END)
      FROM public.pick_scores ps
      WHERE ps.profile_id = p.id
        AND (
          ps.match_id = mid_db
          OR (mid_official IS NOT NULL AND ps.match_id = mid_official)
        );

      DELETE FROM public.pick_scores ps
      WHERE ps.match_id = mid_db
         OR (mid_official IS NOT NULL AND ps.match_id = mid_official);

      score_result := public.score_match(mid_db, p_home_score, p_away_score);

      IF score_result ? 'error' THEN
        RETURN score_result || jsonb_build_object('rescored', false);
      END IF;

      RETURN score_result || jsonb_build_object('rescored', true, 'via', 'rescore_match');
    END;
    $body$;
  $fn$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.apply_rescore_match(
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

      score_result := public.rescore_match(p_match_id, p_home_score, p_away_score);

      RETURN score_result || jsonb_build_object('via', coalesce(score_result->>'via', 'rescore_match'));
    END;
    $body$;
  $fn$;

  GRANT EXECUTE ON FUNCTION public.score_match(text, integer, integer) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.score_match(text, integer, integer) TO service_role;
  GRANT EXECUTE ON FUNCTION public.rescore_match(text, integer, integer) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.rescore_match(text, integer, integer) TO service_role;
  GRANT EXECUTE ON FUNCTION public.apply_rescore_match(text, integer, integer) TO authenticated;

  RAISE NOTICE '[rescore_match] score_match, rescore_match, transfer_kraken_throne_if_needed y apply_rescore_match instaladas.';
END;
$rescore_match$;
