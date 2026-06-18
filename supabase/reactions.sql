-- Reacciones al chat (una fila por usuario + emoji + comentario).
-- Si migraste desde chat_reactions, renombra o copia datos antes de borrar la tabla vieja.

create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint reactions_emoji_allowed check (
    emoji in ('❤️', '😂', '🔥', '😭', '👀', '🐙', '⚽')
  ),
  constraint reactions_one_per_user_emoji unique (comment_id, profile_id, emoji)
);

create index if not exists reactions_comment_id_idx on public.reactions (comment_id);

alter table public.reactions enable row level security;

create policy "reactions_select_authenticated"
  on public.reactions for select
  to authenticated
  using (true);

create policy "reactions_insert_own"
  on public.reactions for insert
  to authenticated
  with check (auth.uid() = profile_id);

create policy "reactions_delete_own"
  on public.reactions for delete
  to authenticated
  using (auth.uid() = profile_id);

-- Realtime: añadir public.reactions a la publicación supabase_realtime en el dashboard.

-- Migración idempotente: ver supabase/fix_reactions_unique_constraint.sql
-- (elimina UNIQUE (mensaje, emoji) y crea UNIQUE (mensaje, usuario, emoji)).
