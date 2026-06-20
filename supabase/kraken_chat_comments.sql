-- Mensajes del Kraken en el chat de comunidad (tabla comments).
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS is_kraken boolean NOT NULL DEFAULT false;

ALTER TABLE public.comments
  ALTER COLUMN profile_id DROP NOT NULL;

DROP POLICY IF EXISTS comments_insert_kraken ON public.comments;

CREATE POLICY comments_insert_kraken
  ON public.comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_kraken = true
    AND (
      profile_id IS NULL
      OR profile_id = '00000000-0000-0000-0000-000000000001'::uuid
    )
  );
