-- Restaura reacciones del chat de comunidad (RLS + esquema + RPC).
-- Ejecutar en Supabase → SQL Editor (producción).
--
-- Tabla canónica: public.reactions
-- Columnas canónicas: comment_id (FK comments.id), profile_id (FK profiles.id = auth.uid())
-- NO usar user_id en políticas: en este proyecto el usuario es profile_id.

-- 1) Renombrar chat_reactions → reactions si aplica
DO $rename_table$
BEGIN
  IF to_regclass('public.reactions') IS NULL AND to_regclass('public.chat_reactions') IS NOT NULL THEN
    ALTER TABLE public.chat_reactions RENAME TO reactions;
    RAISE NOTICE '[reactions] Renombrado chat_reactions → reactions';
  END IF;
END;
$rename_table$;

-- 2) Crear tabla si no existe
CREATE TABLE IF NOT EXISTS public.reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.comments (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reactions_emoji_allowed CHECK (
    emoji IN ('❤️', '😂', '🔥', '😭', '👀', '🐙', '⚽')
  )
);

-- 3) Normalizar nombres legacy (message_id / user_id)
DO $normalize_cols$
DECLARE
  has_comment_id boolean;
  has_message_id boolean;
  has_profile_id boolean;
  has_user_id boolean;
BEGIN
  IF to_regclass('public.reactions') IS NULL THEN
    RAISE EXCEPTION 'public.reactions no existe tras migración.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reactions' AND column_name = 'comment_id'
  ) INTO has_comment_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reactions' AND column_name = 'message_id'
  ) INTO has_message_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reactions' AND column_name = 'profile_id'
  ) INTO has_profile_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reactions' AND column_name = 'user_id'
  ) INTO has_user_id;

  IF has_message_id AND NOT has_comment_id THEN
    ALTER TABLE public.reactions RENAME COLUMN message_id TO comment_id;
    RAISE NOTICE '[reactions] Renombrado message_id → comment_id';
  END IF;

  IF has_user_id AND NOT has_profile_id THEN
    ALTER TABLE public.reactions RENAME COLUMN user_id TO profile_id;
    RAISE NOTICE '[reactions] Renombrado user_id → profile_id';
  END IF;
END;
$normalize_cols$;

CREATE INDEX IF NOT EXISTS reactions_comment_id_idx ON public.reactions (comment_id);

-- 4) UNIQUE correcto: (comment_id, profile_id, emoji) — no solo (comment_id, emoji)
DO $fix_unique$
DECLARE
  r record;
  user_col text := 'profile_id';
BEGIN
  FOR r IN
    SELECT c.conname AS name,
           array_agg(a.attname ORDER BY u.ordinality) AS col_names
    FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS u(attnum, ordinality)
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
    WHERE c.conrelid = 'public.reactions'::regclass
      AND c.contype = 'u'
    GROUP BY c.conname
  LOOP
    IF 'emoji' = ANY(r.col_names)
       AND NOT (user_col = ANY(r.col_names) OR 'user_id' = ANY(r.col_names)) THEN
      EXECUTE format('ALTER TABLE public.reactions DROP CONSTRAINT %I', r.name);
      RAISE NOTICE '[reactions] Eliminado UNIQUE incorrecto %', r.name;
    END IF;
  END LOOP;

  ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS reactions_one_per_user_emoji;
  ALTER TABLE public.reactions
    ADD CONSTRAINT reactions_one_per_user_emoji
    UNIQUE (comment_id, profile_id, emoji);
END;
$fix_unique$;

-- 5) RLS (profile_id, no user_id)
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert reactions" ON public.reactions;
DROP POLICY IF EXISTS "Users can delete own reactions" ON public.reactions;
DROP POLICY IF EXISTS "Reactions are viewable by everyone" ON public.reactions;
DROP POLICY IF EXISTS reactions_select_authenticated ON public.reactions;
DROP POLICY IF EXISTS reactions_insert_own ON public.reactions;
DROP POLICY IF EXISTS reactions_delete_own ON public.reactions;

CREATE POLICY "Reactions are viewable by everyone"
  ON public.reactions
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert reactions"
  ON public.reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can delete own reactions"
  ON public.reactions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = profile_id);

-- 6) RPC toggle (evita carreras cliente + bypass RLS con SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.toggle_comment_reaction(
  p_comment_id uuid,
  p_emoji text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row_id uuid;
  allowed constant text[] := ARRAY['❤️', '😂', '🔥', '😭', '👀', '🐙', '⚽'];
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_emoji IS NULL OR NOT (p_emoji = ANY(allowed)) THEN
    RAISE EXCEPTION 'emoji_not_allowed';
  END IF;

  SELECT id INTO row_id
  FROM public.reactions
  WHERE comment_id = p_comment_id
    AND profile_id = uid
    AND emoji = p_emoji
  LIMIT 1;

  IF row_id IS NOT NULL THEN
    DELETE FROM public.reactions WHERE id = row_id;
    RETURN jsonb_build_object('action', 'removed', 'comment_id', p_comment_id, 'emoji', p_emoji);
  END IF;

  INSERT INTO public.reactions (comment_id, profile_id, emoji)
  VALUES (p_comment_id, uid, p_emoji)
  RETURNING id INTO row_id;

  RETURN jsonb_build_object('action', 'added', 'id', row_id, 'comment_id', p_comment_id, 'emoji', p_emoji);
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_comment_reaction(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_comment_reaction(uuid, text) TO authenticated;

-- 7) Realtime (idempotente)
DO $realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'reactions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;
      RAISE NOTICE '[reactions] Añadido a supabase_realtime';
    END IF;
  END IF;
END;
$realtime$;
