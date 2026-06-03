-- Pulponi Cup — Historial de ranking por jornada (movimiento ↑ ↓)
-- Ejecutar en Supabase → SQL Editor

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
comment on table public.ranking_history is 'Posición y puntos de cada jugador por jornada';
