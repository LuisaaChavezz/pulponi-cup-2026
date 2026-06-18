-- Corrige reactions para permitir varios usuarios con el mismo emoji en un mensaje.
-- Clave única correcta: (mensaje, usuario, emoji) — NO (mensaje, emoji).
--
-- En este proyecto:
--   message_id  → columna comment_id (FK a comments.id)
--   user_id     → columna profile_id (FK a profiles.id)
--
-- Ejecutar en Supabase SQL Editor (producción).

DO $fix_reactions_unique$
DECLARE
  r record;
  has_comment_id boolean;
  has_message_id boolean;
  has_profile_id boolean;
  has_user_id boolean;
  user_col text;
  msg_col text;
BEGIN
  IF to_regclass('public.reactions') IS NULL THEN
    RAISE EXCEPTION 'public.reactions no existe. Ejecuta supabase/reactions.sql primero.';
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

  -- Normalizar nombres de columnas al esquema del cliente (comment_id / profile_id).
  IF has_message_id AND NOT has_comment_id THEN
    ALTER TABLE public.reactions RENAME COLUMN message_id TO comment_id;
    has_comment_id := true;
    has_message_id := false;
    RAISE NOTICE '[reactions] Renombrado message_id → comment_id';
  END IF;

  IF has_user_id AND NOT has_profile_id THEN
    ALTER TABLE public.reactions RENAME COLUMN user_id TO profile_id;
    has_profile_id := true;
    has_user_id := false;
    RAISE NOTICE '[reactions] Renombrado user_id → profile_id';
  END IF;

  IF NOT has_comment_id OR NOT has_profile_id THEN
    RAISE EXCEPTION 'reactions debe tener comment_id y profile_id (mensaje y usuario).';
  END IF;

  msg_col := 'comment_id';
  user_col := 'profile_id';

  -- Eliminar UNIQUE incorrectos: incluyen emoji pero NO incluyen columna de usuario.
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
      RAISE NOTICE '[reactions] Eliminado UNIQUE incorrecto % (%)', r.name, r.col_names;
    END IF;
  END LOOP;

  -- Eliminar índices UNIQUE huérfanos (mismo criterio).
  FOR r IN
    SELECT indexname AS name, indexdef AS def
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'reactions'
      AND indexdef ~* 'unique'
      AND indexdef ~* 'emoji'
      AND indexdef !~* 'profile_id'
      AND indexdef !~* 'user_id'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.name);
    RAISE NOTICE '[reactions] Eliminado índice UNIQUE incorrecto %', r.name;
  END LOOP;

  -- Nombres conocidos de constraints viejos (por si el loop anterior no los detectó).
  BEGIN
    ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS reactions_comment_id_emoji_key;
    ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS reactions_message_id_emoji_key;
    ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS chat_reactions_comment_id_emoji_key;
    ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS chat_reactions_message_id_emoji_key;
    ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS reactions_one_per_emoji;
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;

  -- Recrear constraint correcto: (comment_id, profile_id, emoji) = (message_id, user_id, emoji).
  ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS reactions_one_per_user_emoji;

  ALTER TABLE public.reactions
    ADD CONSTRAINT reactions_one_per_user_emoji
    UNIQUE (comment_id, profile_id, emoji);

  RAISE NOTICE '[reactions] OK — UNIQUE (comment_id, profile_id, emoji) activo.';
END;
$fix_reactions_unique$;
