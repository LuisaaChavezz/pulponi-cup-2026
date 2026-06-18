-- RPC opcional: toggle de reacción en servidor (evita carreras en el cliente).
-- Ejecutar después de fix_reactions_unique_constraint.sql

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
