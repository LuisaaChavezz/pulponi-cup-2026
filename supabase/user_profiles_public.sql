-- Perfiles públicos: lectura de actividad y picks de otros usuarios (autenticados)
-- Ejecutar si activity_log o pick_scores bloquean perfiles ajenos.

alter table public.activity_log enable row level security;

drop policy if exists "activity_log_select_authenticated" on public.activity_log;
create policy "activity_log_select_authenticated"
  on public.activity_log
  for select
  to authenticated
  using (true);

-- pick_scores: lectura para historial público (escritura vía RPC scoring)
alter table public.pick_scores enable row level security;

drop policy if exists "pick_scores_select_authenticated" on public.pick_scores;
create policy "pick_scores_select_authenticated"
  on public.pick_scores
  for select
  to authenticated
  using (true);

-- user_badges: lectura pública entre miembros
drop policy if exists "user_badges_select_authenticated" on public.user_badges;
create policy "user_badges_select_authenticated"
  on public.user_badges
  for select
  to authenticated
  using (true);
