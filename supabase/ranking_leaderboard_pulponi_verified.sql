-- Leaderboard: solo perfiles pulponi_verified = true (además de auth.users).
-- Ejecutar en SQL Editor. Seguro para re-ejecutar.

CREATE OR REPLACE VIEW public.ranking_leaderboard AS
SELECT
  p.id,
  p.username,
  p.name,
  p.photo_url,
  p.points,
  p.exacts,
  p.streak,
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

CREATE OR REPLACE FUNCTION public.get_ranking_leaderboard()
RETURNS TABLE (
  id uuid,
  username text,
  name text,
  photo_url text,
  points integer,
  exacts integer,
  streak integer,
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
