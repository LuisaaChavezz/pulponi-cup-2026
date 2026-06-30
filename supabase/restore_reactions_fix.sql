-- Restaurar reacciones del chat de comunidad.
-- Diagnóstico en prod: la tabla public.reactions perdió el RPC toggle_comment_reaction,
-- la restricción UNIQUE (comment_id, profile_id, emoji), el CHECK de emojis y la
-- membresía en la publicación supabase_realtime. La RLS sí estaba correcta.
--
-- NOTA: esta app usa la columna profile_id (= auth.uid()), NO user_id.
-- Las políticas RLS existentes ya son correctas, no se recrean aquí.

-- 1) Limpiar emojis fuera de la lista permitida (por si hubiera basura)
DELETE FROM public.reactions
WHERE emoji NOT IN ('❤️', '😂', '🔥', '😭', '👀', '🐙', '⚽');

-- 2) Eliminar duplicados (misma persona + comentario + emoji), conservando el más antiguo
DELETE FROM public.reactions r
USING public.reactions r2
WHERE r.comment_id = r2.comment_id
  AND r.profile_id = r2.profile_id
  AND r.emoji = r2.emoji
  AND (r.created_at > r2.created_at OR (r.created_at = r2.created_at AND r.id > r2.id));

-- 3) Restricción única: una reacción por usuario/emoji/comentario
ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS reactions_one_per_user_emoji;
ALTER TABLE public.reactions
  ADD CONSTRAINT reactions_one_per_user_emoji UNIQUE (comment_id, profile_id, emoji);

-- 4) CHECK de emojis permitidos
ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS reactions_emoji_allowed;
ALTER TABLE public.reactions
  ADD CONSTRAINT reactions_emoji_allowed CHECK (
    emoji IN ('❤️', '😂', '🔥', '😭', '👀', '🐙', '⚽')
  );

-- 5) Índice por comentario (para reload rápido)
CREATE INDEX IF NOT EXISTS reactions_comment_id_idx ON public.reactions (comment_id);

-- 6) RPC toggle_comment_reaction (camino principal del cliente)
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

-- 7) Realtime: añadir la tabla a la publicación (idempotente)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END;
$$;
