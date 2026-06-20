-- Columna is_kraken en el chat de comunidad (tabla comments).
-- Ejecutar en Supabase SQL Editor si el chat dejó de cargar tras agregar is_kraken al SELECT.

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS is_kraken boolean NOT NULL DEFAULT false;

ALTER TABLE public.comments
  ALTER COLUMN profile_id DROP NOT NULL;
