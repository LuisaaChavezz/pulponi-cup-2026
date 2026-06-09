-- Logros Pulponi (Fase 4): catálogo + desbloqueos por usuario
-- Ejecutar después de profiles, pick_scores, ranking_history y pulpo_scoring.

create table if not exists public.badges (
  id text primary key,
  name text not null,
  description text not null default '',
  icon text not null default '🏆',
  requirement_text text,
  rule_key text,
  rule_threshold integer not null default 0,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_badges (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  badge_id text not null references public.badges (id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (profile_id, badge_id)
);

create index if not exists user_badges_profile_id_idx on public.user_badges (profile_id);
create index if not exists user_badges_badge_id_idx on public.user_badges (badge_id);

alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

drop policy if exists "badges_select_authenticated" on public.badges;
create policy "badges_select_authenticated"
  on public.badges for select to authenticated using (true);

drop policy if exists "user_badges_select_authenticated" on public.user_badges;
create policy "user_badges_select_authenticated"
  on public.user_badges for select to authenticated using (true);

drop policy if exists "user_badges_insert_own" on public.user_badges;
create policy "user_badges_insert_own"
  on public.user_badges for insert to authenticated
  with check (profile_id = auth.uid());

insert into public.badges (id, name, description, icon, requirement_text, rule_key, rule_threshold, sort_order, active)
values
  ('francotirador', 'Francotirador', 'Primer marcador exacto. Ya diste en el blanco.', '🎯', 'Acertar 1 marcador exacto.', 'exacts_min', 1, 1, true),
  ('francotirador-pro', 'Francotirador Pro', 'Tres exactos. Ojo de águila activado.', '🎯🎯', 'Acertar 3 marcadores exactos.', 'exacts_min', 3, 2, true),
  ('maestro-marcador', 'Maestro del Marcador', 'Cinco exactos. Eres una máquina.', '🎯🎯🎯', 'Acertar 5 marcadores exactos.', 'exacts_min', 5, 3, true),
  ('enrachado', 'Enrachado', 'Tres aciertos seguidos. Te sientes imparable.', '🔥', 'Acertar 3 resultados seguidos.', 'streak_min', 3, 4, true),
  ('imparable', 'Imparable', 'Cinco seguidos. Modo bestia.', '🔥🔥', 'Acertar 5 resultados seguidos.', 'streak_min', 5, 5, true),
  ('analista', 'Analista', 'Top 5 estable. Lees la quiniela como pro.', '🧠', 'Mantenerse en Top 5 durante 3 jornadas.', 'top5_jornadas', 3, 6, true),
  ('rey-del-pulpo', 'Rey del Pulpo', 'Número uno del ranking. Coronan al pulpo.', '👑', 'Ser #1 del ranking.', 'rank_first', 1, 7, true),
  ('pick-salvaje', 'Pick Salvaje', 'Acertaste lo que casi nadie se atrevió a poner.', '⚡', 'Acertar un marcador elegido por menos del 5% de usuarios.', 'risky_exact', 1, 8, true),
  ('pulpo-legendario', 'Pulpo Legendario', 'Índice Pulpo 90+. Nivel supremo.', '🐙', 'Alcanzar Índice Pulpo 90+.', 'pulpo_index_min', 90, 9, true),
  ('pulpo-futbolero-oficial', 'Pulpo Futbolero Oficial', 'Participaste en Pulponi Cup 2026 desde el arranque del Mundial.', '⚽', 'Entra a Pulponi Cup el 11 de junio de 2026 o después.', 'world_cup_kickoff', 0, 21, true),
  ('parlay-todo-o-nada', 'Todo o Nada', 'Te uniste al parlay Pulponi.', '🏆', 'Inscríbete en el parlay Pulponi.', 'parlay_inscrito', 0, 22, true),
  ('quiniela-aceptaste-el-reto', 'La Quiniela Llama', 'Aceptaste el reto y entraste a la competencia.', '⚽', 'Inscríbete en la quiniela Pulponi.', 'quiniela_inscrito', 0, 23, true),
  ('comentarista-pulponi', 'Comentarista Pulponi', 'Próximamente.', '💬', 'Envía 50 mensajes en el chat.', 'placeholder', 0, 10, false),
  ('favorito-comunidad', 'Favorito de la Comunidad', 'Próximamente.', '❤️', 'Recibe 30 reacciones en el chat.', 'placeholder', 0, 11, false),
  ('pulpo-social', 'Pulpo Social', 'Próximamente.', '🫂', 'Interactúa con 20 perfiles distintos.', 'placeholder', 0, 12, false),
  ('senor-mundial', 'Señor Mundial', 'Próximamente.', '🌍', 'Predice partidos de todos los grupos.', 'placeholder', 0, 13, false),
  ('campeon-mundial', 'Campeón del Mundo', 'Próximamente.', '🏆', 'Gana la quiniela completa.', 'placeholder', 0, 14, false),
  ('top-3-pulponi', 'Top 3 Pulponi', 'Próximamente.', '🥇', 'Termina entre los 3 mejores.', 'placeholder', 0, 15, false),
  ('visionario-total', 'Visionario Total', 'Próximamente.', '👀', 'Acierta 10 marcadores exactos.', 'placeholder', 0, 16, false),
  ('goat-pulponi', 'GOAT Pulponi', 'Próximamente.', '🐐', 'Mantente #1 durante 5 jornadas.', 'placeholder', 0, 17, false),
  ('exacto-relampago', 'Exacto Relámpago', 'Próximamente.', '⚡', 'Acierta un exacto en el último minuto.', 'placeholder', 0, 18, false),
  ('rey-jornada', 'Rey de la Jornada', 'Próximamente.', '👑', 'Lidera el ranking al cierre de una jornada.', 'placeholder', 0, 19, false),
  ('pulponi-supremo', 'Pulponi Supremo', 'Próximamente.', '🐙', 'Desbloquea todos los logros activos.', 'placeholder', 0, 20, false)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  requirement_text = excluded.requirement_text,
  rule_key = excluded.rule_key,
  rule_threshold = excluded.rule_threshold,
  sort_order = excluded.sort_order,
  active = excluded.active;

create or replace function public.grant_user_achievements(grants jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row jsonb;
  inserted integer := 0;
  new_rows jsonb := '[]'::jsonb;
  req_profile uuid;
  req_badge text;
  got_profile uuid;
  got_badge text;
begin
  if grants is null or jsonb_typeof(grants) <> 'array' then
    return jsonb_build_object('inserted', 0, 'new_unlocks', new_rows);
  end if;

  for row in select * from jsonb_array_elements(grants) loop
    req_profile := (row->>'profile_id')::uuid;
    req_badge := row->>'badge_id';

    if req_profile is null or req_badge is null then
      continue;
    end if;

    got_profile := null;
    got_badge := null;

    insert into public.user_badges (profile_id, badge_id)
    values (req_profile, req_badge)
    on conflict (profile_id, badge_id) do nothing
    returning profile_id, badge_id into got_profile, got_badge;

    if got_profile is not null then
      inserted := inserted + 1;
      new_rows := new_rows || jsonb_build_array(jsonb_build_object('profile_id', got_profile, 'badge_id', got_badge));
    end if;
  end loop;

  return jsonb_build_object('inserted', inserted, 'new_unlocks', new_rows);
end;
$$;

grant execute on function public.grant_user_achievements(jsonb) to authenticated;
