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
      caller_username text;
      score_result jsonb;
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

      IF p_match_id IS NULL OR trim(p_match_id) = '' THEN
        RETURN jsonb_build_object('error', 'match_id_required');
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

      -- Trigger puntúa al UPDATE; llamada explícita por si el trigger aún no está instalado.
      score_result := public.score_finished_match(p_match_id, true);

      RETURN score_result
        || jsonb_build_object(
          'home_score', p_home_score,
          'away_score', p_away_score,
          'via', 'admin_rpc'
        );
    END;
    $body$;
  $fn$;

  GRANT EXECUTE ON FUNCTION public.apply_match_final_result(text, integer, integer) TO authenticated;

  RAISE NOTICE '[apply_match_final_result] RPC instalada.';
END;
$apply_match_final$;
