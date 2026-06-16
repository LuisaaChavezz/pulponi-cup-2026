-- Historial de transferencias del badge El Elegido (el-elegido).
-- Ejecutar en Supabase SQL Editor si la tabla aún no existe.

create table if not exists public.elegido_history (
  id uuid primary key default gen_random_uuid(),
  previous_username text,
  new_username text not null,
  transferred_at timestamptz not null default now()
);

create index if not exists elegido_history_transferred_at_idx
  on public.elegido_history (transferred_at desc);

alter table public.elegido_history enable row level security;

drop policy if exists "elegido_history_select_admin" on public.elegido_history;
drop policy if exists "elegido_history_select_authenticated" on public.elegido_history;
create policy "elegido_history_select_authenticated"
  on public.elegido_history for select to authenticated
  using (true);

-- Realtime (ignorar si ya está en la publicación)
do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.elegido_history;
    exception
      when duplicate_object then null;
    end;
  end if;
end;
$realtime$;
