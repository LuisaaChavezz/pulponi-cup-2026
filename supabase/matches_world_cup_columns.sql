-- =============================================================================
-- Pulponi Cup — Tabla `matches` para API-Football (Mundial 2026)
-- Ejecutar en Supabase → SQL Editor
-- =============================================================================

-- Extensión UUID (por si no existe)
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1) Crear tabla (si no existe)
-- -----------------------------------------------------------------------------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),

  -- Vínculo API-Football
  api_fixture_id bigint unique,
  api_status text, -- NS, 1H, HT, 2H, LIVE, FT, AET, PEN, etc.
  is_demo boolean not null default false, -- true = partido de prueba (reemplazable por API)
  provisional boolean not null default false, -- calendario FIFA hasta fixture API-Football
  official_id text, -- id estable fifa-wc26-xxx

  -- Equipos
  home_team text not null,
  away_team text not null,
  home_logo text,
  away_logo text,
  home_flag text, -- emoji fallback (opcional)
  away_flag text,

  -- Competición / fase
  group_name text,
  is_knockout boolean not null default false,

  -- Programación y sede
  kickoff timestamptz,
  venue text,
  venue_city text,

  -- Estado normalizado para la app: scheduled | live | finished
  status text not null default 'scheduled',

  -- Marcador
  home_score integer not null default 0,
  away_score integer not null default 0,
  minute integer,

  -- Detalle en vivo (API-Football)
  events jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  cards jsonb not null default '[]'::jsonb,
  penalties jsonb,
  winner text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2) Añadir columnas si la tabla ya existía (migración segura)
-- -----------------------------------------------------------------------------
alter table public.matches add column if not exists api_fixture_id bigint;
alter table public.matches add column if not exists is_demo boolean default false;
alter table public.matches add column if not exists provisional boolean default false;
alter table public.matches add column if not exists official_id text;
alter table public.matches add column if not exists api_status text;
alter table public.matches add column if not exists home_logo text;
alter table public.matches add column if not exists away_logo text;
alter table public.matches add column if not exists home_flag text;
alter table public.matches add column if not exists away_flag text;
alter table public.matches add column if not exists group_name text;
alter table public.matches add column if not exists league_id integer;
alter table public.matches add column if not exists season integer;
alter table public.matches add column if not exists is_knockout boolean default false;
alter table public.matches add column if not exists kickoff timestamptz;
alter table public.matches add column if not exists venue text;
alter table public.matches add column if not exists venue_city text;
alter table public.matches add column if not exists status text default 'scheduled';
alter table public.matches add column if not exists home_score integer default 0;
alter table public.matches add column if not exists away_score integer default 0;
alter table public.matches add column if not exists minute integer;
alter table public.matches add column if not exists events jsonb default '[]'::jsonb;
alter table public.matches add column if not exists goals jsonb default '[]'::jsonb;
alter table public.matches add column if not exists cards jsonb default '[]'::jsonb;
alter table public.matches add column if not exists penalties jsonb;
alter table public.matches add column if not exists winner text;
alter table public.matches add column if not exists created_at timestamptz default now();
alter table public.matches add column if not exists updated_at timestamptz default now();

-- Unique en api_fixture_id (solo si no existe el constraint)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'matches_api_fixture_id_key'
  ) then
    alter table public.matches
      add constraint matches_api_fixture_id_key unique (api_fixture_id);
  end if;
end $$;

-- NOT NULL en columnas críticas (solo si aún permiten null)
alter table public.matches alter column home_team set default 'Local';
alter table public.matches alter column away_team set default 'Visitante';
update public.matches set home_team = 'Local' where home_team is null;
update public.matches set away_team = 'Visitante' where away_team is null;
alter table public.matches alter column home_team set not null;
alter table public.matches alter column away_team set not null;

alter table public.matches alter column status set default 'scheduled';
update public.matches set status = 'scheduled' where status is null;
alter table public.matches alter column status set not null;

alter table public.matches alter column home_score set default 0;
alter table public.matches alter column away_score set default 0;
update public.matches set home_score = 0 where home_score is null;
update public.matches set away_score = 0 where away_score is null;

alter table public.matches alter column is_knockout set default false;
update public.matches set is_knockout = false where is_knockout is null;
alter table public.matches alter column is_knockout set not null;

update public.matches set events = '[]'::jsonb where events is null;
update public.matches set goals = '[]'::jsonb where goals is null;
update public.matches set cards = '[]'::jsonb where cards is null;

alter table public.matches alter column is_demo set default false;
update public.matches set is_demo = false where is_demo is null;
update public.matches set is_demo = true where api_fixture_id < 0 and is_demo is distinct from true;
alter table public.matches alter column is_demo set not null;

alter table public.matches alter column provisional set default false;
update public.matches set provisional = false where provisional is null;
alter table public.matches alter column provisional set not null;

create unique index if not exists matches_official_id_key
  on public.matches (official_id)
  where official_id is not null;

-- -----------------------------------------------------------------------------
-- 3) Índices
-- -----------------------------------------------------------------------------
create index if not exists matches_kickoff_idx on public.matches (kickoff);
create index if not exists matches_status_idx on public.matches (status);
create index if not exists matches_api_status_idx on public.matches (api_status);
create index if not exists matches_api_fixture_id_idx on public.matches (api_fixture_id);
create index if not exists matches_is_demo_idx on public.matches (is_demo);

-- -----------------------------------------------------------------------------
-- 4) Trigger updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_matches_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists matches_set_updated_at on public.matches;
create trigger matches_set_updated_at
before update on public.matches
for each row
execute function public.set_matches_updated_at();

-- -----------------------------------------------------------------------------
-- 5) Row Level Security (RLS)
-- -----------------------------------------------------------------------------
alter table public.matches enable row level security;

drop policy if exists "matches_select_public" on public.matches;
create policy "matches_select_public"
  on public.matches
  for select
  using (true);

drop policy if exists "matches_insert_authenticated" on public.matches;
create policy "matches_insert_authenticated"
  on public.matches
  for insert
  to authenticated
  with check (true);

drop policy if exists "matches_update_authenticated" on public.matches;
create policy "matches_update_authenticated"
  on public.matches
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "matches_delete_authenticated" on public.matches;
create policy "matches_delete_authenticated"
  on public.matches
  for delete
  to authenticated
  using (true);

-- -----------------------------------------------------------------------------
-- 6) Realtime (activar en Dashboard → Database → Replication, o descomenta):
-- -----------------------------------------------------------------------------
-- alter publication supabase_realtime add table public.matches;

-- -----------------------------------------------------------------------------
-- 7) Comentarios de referencia
-- -----------------------------------------------------------------------------
comment on table public.matches is 'Partidos Pulponi Cup sincronizados con API-Football';
comment on column public.matches.api_fixture_id is 'ID fixture en API-Football (único); negativo = demo';
comment on column public.matches.is_demo is 'Partido de prueba; se elimina al importar fixtures reales de API-Football';
comment on column public.matches.provisional is 'Calendario oficial FIFA; se actualiza in-place al llegar fixture API-Football (conserva picks)';
comment on column public.matches.official_id is 'Clave estable del calendario FIFA (fifa-wc26-xxx)';
comment on column public.matches.api_status is 'Estado corto API: NS, 1H, HT, 2H, LIVE, FT, AET, PEN';
comment on column public.matches.status is 'scheduled | live | finished (normalizado para UI)';
comment on column public.matches.events is 'Timeline: goles, tarjetas, VAR, etc.';
comment on column public.matches.goals is 'Array de goles parseados';
comment on column public.matches.cards is 'Array de tarjetas';
comment on column public.matches.penalties is 'Marcador penales { home, away }';
