-- Corrige unique incorrecto en reactions: (comment_id, emoji) → (comment_id, profile_id, emoji).
-- Ejecutar en Supabase SQL Editor si dos usuarios no pueden reaccionar con el mismo emoji.

DO $fix_reactions_unique$
DECLARE
  r record;
BEGIN
  IF to_regclass('public.reactions') IS NULL THEN
    RAISE NOTICE '[reactions] Tabla public.reactions no existe; omitiendo.';
    RETURN;
  END IF;

  -- Eliminar constraints UNIQUE que solo cubren (comment_id, emoji).
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
    IF array_length(r.col_names, 1) = 2
       AND r.col_names @> ARRAY['comment_id', 'emoji']::text[] THEN
      EXECUTE format('ALTER TABLE public.reactions DROP CONSTRAINT %I', r.name);
      RAISE NOTICE '[reactions] Eliminado constraint incorrecto: %', r.name;
    END IF;
  END LOOP;

  -- Eliminar índices UNIQUE equivalentes sin profile_id.
  FOR r IN
    SELECT indexname AS name
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'reactions'
      AND indexdef ~* 'unique'
      AND indexdef ~* 'comment_id'
      AND indexdef ~* 'emoji'
      AND indexdef !~* 'profile_id'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.name);
    RAISE NOTICE '[reactions] Eliminado índice único incorrecto: %', r.name;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.reactions'::regclass
      AND conname = 'reactions_one_per_user_emoji'
  ) THEN
    ALTER TABLE public.reactions
      ADD CONSTRAINT reactions_one_per_user_emoji
      UNIQUE (comment_id, profile_id, emoji);
    RAISE NOTICE '[reactions] Creado unique (comment_id, profile_id, emoji).';
  ELSE
    RAISE NOTICE '[reactions] unique reactions_one_per_user_emoji ya existe.';
  END IF;
END;
$fix_reactions_unique$;
