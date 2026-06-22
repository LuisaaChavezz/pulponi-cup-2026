-- Lectura pública de perfiles (perfiles ajenos en la app).
-- Ejecutar en Supabase SQL Editor si los perfiles no cargan por RLS.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles
  FOR SELECT
  USING (true);

-- Mantiene compatibilidad con el nombre anterior usado en la app.
DROP POLICY IF EXISTS "profiles_select_community_picks" ON public.profiles;
CREATE POLICY "profiles_select_community_picks"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);
