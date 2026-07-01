-- Reconstrucción del sistema de reacciones del chat (7 emojis Pulponi).
-- NOTA: esta app usa profile_id (= auth.uid()), NO user_id.
-- Ejecutar en Supabase antes del deploy del frontend.

CREATE TABLE IF NOT EXISTS public.reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Asegurar columnas si la tabla ya existía con otro esquema
ALTER TABLE public.reactions ADD COLUMN IF NOT EXISTS profile_id uuid;
ALTER TABLE public.reactions ADD COLUMN IF NOT EXISTS comment_id uuid;
ALTER TABLE public.reactions ADD COLUMN IF NOT EXISTS emoji text;
ALTER TABLE public.reactions ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Normalizar balón: ⚽ → ⚽️ (con selector de variación)
UPDATE public.reactions SET emoji = '⚽️' WHERE emoji = '⚽';

-- Limpiar emojis fuera de la lista permitida
DELETE FROM public.reactions
WHERE emoji NOT IN ('❤️', '😂', '🔥', '😭', '🐙', '👀', '⚽️');

-- Duplicados (misma persona + comentario + emoji)
DELETE FROM public.reactions r
USING public.reactions r2
WHERE r.comment_id = r2.comment_id
  AND r.profile_id = r2.profile_id
  AND r.emoji = r2.emoji
  AND (r.created_at > r2.created_at OR (r.created_at = r2.created_at AND r.id > r2.id));

ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS reactions_one_per_user_emoji;
ALTER TABLE public.reactions
  ADD CONSTRAINT reactions_one_per_user_emoji UNIQUE (comment_id, profile_id, emoji);

ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS reactions_emoji_allowed;
ALTER TABLE public.reactions
  ADD CONSTRAINT reactions_emoji_allowed CHECK (
    emoji IN ('❤️', '😂', '🔥', '😭', '🐙', '👀', '⚽️')
  );

CREATE INDEX IF NOT EXISTS reactions_comment_id_idx ON public.reactions (comment_id);

ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reactions_select ON public.reactions;
DROP POLICY IF EXISTS reactions_insert ON public.reactions;
DROP POLICY IF EXISTS reactions_delete ON public.reactions;
DROP POLICY IF EXISTS reactions_select_public ON public.reactions;
DROP POLICY IF EXISTS reactions_insert_own ON public.reactions;
DROP POLICY IF EXISTS reactions_delete_own ON public.reactions;

CREATE POLICY reactions_select ON public.reactions
  FOR SELECT USING (true);

CREATE POLICY reactions_insert ON public.reactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY reactions_delete ON public.reactions
  FOR DELETE TO authenticated
  USING (auth.uid() = profile_id);

-- Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END;
$$;
