-- Permite leer picks de todos los perfiles (agregados en Termómetro / comunidad).
-- Ejecutar en Supabase SQL Editor si la app no ve predicciones ajenas.

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_community_picks" on public.profiles;
create policy "profiles_select_community_picks"
  on public.profiles
  for select
  to authenticated
  using (true);
