-- Índice Pulpo + puntuación real (ejecutar en Supabase SQL Editor)
-- Requiere: profiles.picks (jsonb), tabla matches

-- Columnas de ranking / índice en perfiles
alter table public.profiles add column if not exists points integer not null default 0;
alter table public.profiles add column if not exists exacts integer not null default 0;
alter table public.profiles add column if not exists streak integer not null default 0;
alter table public.profiles add column if not exists pulpo_index integer not null default 0;
alter table public.profiles add column if not exists pulpo_stats jsonb not null default '{}'::jsonb;

-- Puntos por partido y usuario (evita doble conteo)
create table if not exists public.pick_scores (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  points_awarded integer not null default 0,
  exact_hit boolean not null default false,
  winner_hit boolean not null default false,
  scored_at timestamptz not null default now(),
  primary key (profile_id, match_id)
);

create index if not exists pick_scores_match_id_idx on public.pick_scores (match_id);
create index if not exists pick_scores_profile_id_idx on public.pick_scores (profile_id);

alter table public.pick_scores enable row level security;

drop policy if exists "pick_scores_select_authenticated" on public.pick_scores;
create policy "pick_scores_select_authenticated"
  on public.pick_scores
  for select
  to authenticated
  using (true);

-- Escritura solo vía funciones SECURITY DEFINER (no insert directo desde cliente)

create or replace function public._match_is_finished(m public.matches)
returns boolean
language sql
stable
as $$
  select (
    upper(trim(coalesce(m.api_status, ''))) in ('FT', 'AET', 'PEN')
    or lower(trim(coalesce(m.status, ''))) in ('finished', 'ft', 'aet', 'pen', 'terminado', 'final')
  )
  and m.home_score is not null
  and m.away_score is not null;
$$;

create or replace function public._grade_pick(
  pick jsonb,
  home_score integer,
  away_score integer
)
returns table (
  points_awarded integer,
  exact_hit boolean,
  winner_hit boolean
)
language plpgsql
immutable
as $$
declare
  hp integer;
  ap integer;
begin
  if pick is null or jsonb_typeof(pick) <> 'object' then
    return query select 0, false, false;
    return;
  end if;

  hp := nullif(trim(pick->>'home_pick'), '')::integer;
  ap := nullif(trim(pick->>'away_pick'), '')::integer;

  if hp is null or ap is null or hp < 0 or ap < 0 then
    return query select 0, false, false;
    return;
  end if;

  if hp = home_score and ap = away_score then
    return query select 3, true, true;
    return;
  end if;

  if (hp > ap and home_score > away_score)
     or (ap > hp and away_score > home_score)
     or (hp = ap and home_score = away_score) then
    return query select 1, false, true;
    return;
  end if;

  return query select 0, false, false;
end;
$$;

create or replace function public.recompute_profile_streaks()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  prof record;
  m record;
  pts integer;
  ex_hit boolean;
  win_hit boolean;
  run_streak integer;
begin
  for prof in select id from public.profiles loop
    run_streak := 0;

    for m in
      select id, kickoff
      from public.matches
      where public._match_is_finished(matches.*)
      order by kickoff asc nulls last, id asc
    loop
      select ps.points_awarded, ps.exact_hit, ps.winner_hit
      into pts, ex_hit, win_hit
      from public.pick_scores ps
      where ps.profile_id = prof.id and ps.match_id = m.id;

      if not found then
        run_streak := 0;
        continue;
      end if;

      if ex_hit or win_hit then
        run_streak := run_streak + 1;
      else
        run_streak := 0;
      end if;
    end loop;

    update public.profiles set streak = run_streak where id = prof.id;
  end loop;
end;
$$;

create or replace function public.score_all_finished_matches()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  prof record;
  pick jsonb;
  g record;
  mid_text text;
  scored_matches integer := 0;
  scored_picks integer := 0;
begin
  for m in
    select *
    from public.matches
    where public._match_is_finished(matches.*)
  loop
    scored_matches := scored_matches + 1;

    for prof in
      select id, picks
      from public.profiles
      where picks is not null and picks <> '{}'::jsonb
    loop
      mid_text := m.id::text;
      pick := prof.picks -> mid_text;
      if pick is null then
        pick := prof.picks -> (mid_text);
      end if;
      if pick is null then
        continue;
      end if;

      select * into g
      from public._grade_pick(pick, m.home_score::integer, m.away_score::integer);

      insert into public.pick_scores (
        profile_id, match_id, points_awarded, exact_hit, winner_hit, scored_at
      )
      values (prof.id, m.id, g.points_awarded, g.exact_hit, g.winner_hit, now())
      on conflict (profile_id, match_id) do update set
        points_awarded = excluded.points_awarded,
        exact_hit = excluded.exact_hit,
        winner_hit = excluded.winner_hit,
        scored_at = now();

      scored_picks := scored_picks + 1;
    end loop;
  end loop;

  update public.profiles p set
    points = coalesce((
      select sum(ps.points_awarded)::integer
      from public.pick_scores ps
      where ps.profile_id = p.id
    ), 0),
    exacts = coalesce((
      select count(*)::integer
      from public.pick_scores ps
      where ps.profile_id = p.id and ps.exact_hit
    ), 0);

  perform public.recompute_profile_streaks();

  return jsonb_build_object(
    'scored_matches', scored_matches,
    'scored_picks', scored_picks
  );
end;
$$;

create or replace function public.sync_pulpo_indexes(updates jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  row jsonb;
  updated_count integer := 0;
  affected integer;
begin
  if updates is null or jsonb_typeof(updates) <> 'array' then
    return 0;
  end if;

  for row in select * from jsonb_array_elements(updates) loop
    update public.profiles
    set
      pulpo_index = greatest(0, least(100, coalesce((row->>'pulpo_index')::integer, 0))),
      pulpo_stats = coalesce(row->'pulpo_stats', '{}'::jsonb)
    where id = (row->>'profile_id')::uuid;

    get diagnostics affected = row_count;
    if affected > 0 then
      updated_count := updated_count + 1;
    end if;
  end loop;

  return updated_count;
end;
$$;

grant execute on function public.score_all_finished_matches() to authenticated;
grant execute on function public.sync_pulpo_indexes(jsonb) to authenticated;
grant execute on function public.recompute_profile_streaks() to authenticated;
