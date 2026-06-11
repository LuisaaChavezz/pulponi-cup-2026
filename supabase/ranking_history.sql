-- Pulponi Cup — Historial de ranking por jornada (movimiento ↑ ↓)
-- Ejecutar en Supabase → SQL Editor
-- Después: supabase/ranking_leaderboard.sql (vista + filtro auth.users en historial)

create extension if not exists "pgcrypto";

create table if not exists public.ranking_jornadas (
  id serial primary key,
  label text,
  created_at timestamptz not null default now()
);

create table if not exists public.ranking_history (
  id uuid primary key default gen_random_uuid(),
  jornada_id integer not null references public.ranking_jornadas (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  rank_position integer not null,
  points integer not null default 0,
  exacts integer not null default 0,
  streak integer not null default 0,
  created_at timestamptz not null default now(),
  unique (jornada_id, profile_id)
);

create index if not exists ranking_history_jornada_idx on public.ranking_history (jornada_id);
create index if not exists ranking_history_profile_idx on public.ranking_history (profile_id);

alter table public.ranking_jornadas enable row level security;
alter table public.ranking_history enable row level security;

drop policy if exists "ranking_jornadas_select" on public.ranking_jornadas;
create policy "ranking_jornadas_select"
  on public.ranking_jornadas for select to authenticated using (true);

drop policy if exists "ranking_jornadas_insert" on public.ranking_jornadas;
create policy "ranking_jornadas_insert"
  on public.ranking_jornadas for insert to authenticated with check (true);

drop policy if exists "ranking_history_select" on public.ranking_history;
create policy "ranking_history_select"
  on public.ranking_history for select to authenticated using (true);

drop policy if exists "ranking_history_insert" on public.ranking_history;
create policy "ranking_history_insert"
  on public.ranking_history for insert to authenticated with check (true);

comment on table public.ranking_jornadas is 'Instantáneas del leaderboard (una fila por jornada/corte)';
comment on table public.ranking_history is 'Posición (dense rank) y puntos de cada jugador por jornada';

-- Elimina jornadas donde todos los jugadores tenían 0 puntos (snapshots inválidos pre-quiniela)
create or replace function public.cleanup_zero_point_ranking_jornadas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  if to_regclass('public.ranking_jornadas') is null then
    return 0;
  end if;

  delete from public.ranking_jornadas j
  where not exists (
    select 1
    from public.ranking_history h
    where h.jornada_id = j.id
      and h.points > 0
  );

  get diagnostics removed = row_count;
  return removed;
end;
$$;

grant execute on function public.cleanup_zero_point_ranking_jornadas() to authenticated;
grant execute on function public.cleanup_zero_point_ranking_jornadas() to service_role;
