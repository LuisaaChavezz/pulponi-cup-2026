-- Mensaje de presentación del Kraken en el chat de comunidad.
-- Tabla real del chat: public.comments (no "messages").
--
-- Adaptación del INSERT genérico:
--   messages.user_id    → comments.profile_id
--   messages.username   → profiles.username (FK profile_id; no columna en comments)
--   messages.content    → comments.body
--   messages.is_kraken  → comments.is_kraken
--   messages.created_at → comments.created_at
--   (extra)             → comments.match_id = 'general'
--
-- Alternativa CLI: npm run seed:kraken-presentation (requiere SUPABASE_SERVICE_ROLE_KEY)

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
