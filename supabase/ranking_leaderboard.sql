-- Pulponi Cup — Leaderboard: solo perfiles con cuenta en auth.users
-- Ejecutar en Supabase → SQL Editor (después de user_profiles_public.sql)
-- Seguro para re-ejecutar.

CREATE OR REPLACE VIEW public.ranking_leaderboard AS
SELECT
  p.id,
  p.username,
  p.name,
  p.photo_url,
  p.points,
  p.exacts,
  p.streak,
  p.total_winner_hits,
  p.pulpo_index,
  p.pulpo_stats,
  p.picks,
  p.created_at
FROM public.profiles p
WHERE EXISTS (
  SELECT 1
  FROM auth.users u
  WHERE u.id = p.id
)
AND p.pulponi_verified = true;

COMMENT ON VIEW public.ranking_leaderboard IS
  'Perfiles con fila en auth.users; usar para ranking / leaderboard (no perfiles huérfanos).';

GRANT SELECT ON public.ranking_leaderboard TO authenticated;
GRANT SELECT ON public.ranking_leaderboard TO service_role;

-- RPC fallback (PostgREST) si la vista aún no está desplegada en el cliente
CREATE OR REPLACE FUNCTION public.get_ranking_leaderboard()
RETURNS TABLE (
  id uuid,
  username text,
  name text,
  photo_url text,
  points integer,
  exacts integer,
  streak integer,
  total_winner_hits integer,
  pulpo_index integer,
  pulpo_stats jsonb,
  picks jsonb,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.username,
    p.name,
    p.photo_url,
    p.points,
    p.exacts,
    p.streak,
    p.total_winner_hits,
    p.pulpo_index,
    p.pulpo_stats,
    p.picks,
    p.created_at
  FROM public.profiles p
  WHERE EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = p.id
  )
  AND p.pulponi_verified = true
  ORDER BY p.points DESC, p.exacts DESC, p.streak DESC, p.username ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_ranking_leaderboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ranking_leaderboard() TO service_role;

-- Limpieza opcional: historial de jornadas sin usuario auth
CREATE OR REPLACE FUNCTION public.cleanup_orphan_ranking_history()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed integer;
BEGIN
  IF to_regclass('public.ranking_history') IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.ranking_history rh
  WHERE NOT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = rh.profile_id
  );

  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_orphan_ranking_history() TO service_role;

-- Historial de ranking: ocultar filas huérfanas en lecturas
DO $ranking_history_auth_filter$
BEGIN
  IF to_regclass('public.ranking_history') IS NULL THEN
    RAISE NOTICE 'ranking_history no existe; omitiendo política auth.users.';
    RETURN;
  END IF;

  ALTER TABLE public.ranking_history ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "ranking_history_select_authenticated" ON public.ranking_history;
  CREATE POLICY "ranking_history_select_authenticated"
    ON public.ranking_history
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE u.id = ranking_history.profile_id
      )
    );

  RAISE NOTICE 'ranking_history_select_authenticated filtrada por auth.users.';
END;
$ranking_history_auth_filter$;
