-- Mensaje de presentación del Kraken en el chat de comunidad.
-- Tabla real del chat: public.comments (no "messages").
--   profile_id  → usuario (FK profiles.id)
--   body        → texto del mensaje (no "content")
--   match_id    → contexto del partido ('general' en comunidad)
--   is_kraken   → boolean, mensaje del Kraken
--   created_at  → timestamp
--
-- Perfil: public.profiles (username, name — no full_name en este proyecto)

-- Columnas Kraken en comments (si aún no corriste kraken_chat_comments.sql)
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

-- Perfil del Kraken (usuario especial del chat)
INSERT INTO public.profiles (id, username, name)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'el-kraken',
  'El Kraken'
)
ON CONFLICT (id) DO UPDATE
SET
  username = EXCLUDED.username,
  name = EXCLUDED.name;

-- Mensaje de presentación (solo una vez)
INSERT INTO public.comments (profile_id, match_id, body, is_kraken, created_at)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  'general',
  '🦑 Veinte partidos confiando. Observando. Creyendo que el elegido era digno. Y entonces Analy llegó y lo igualó todo. Mi trono con dos dueños. Inaceptable. El Kraken despertó furioso. El Kraken no acepta empates. Nunca.',
  true,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.comments WHERE is_kraken = true
);
