-- Mensajes privados del Kraken (solo visibles en inicio del destinatario).

CREATE TABLE IF NOT EXISTS public.kraken_private_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  seen boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kraken_private_messages_profile_unseen_idx
  ON public.kraken_private_messages (profile_id, seen, created_at DESC);

ALTER TABLE public.kraken_private_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see their own kraken messages" ON public.kraken_private_messages;
CREATE POLICY "Users can see their own kraken messages"
  ON public.kraken_private_messages
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own kraken messages" ON public.kraken_private_messages;
CREATE POLICY "Users can insert their own kraken messages"
  ON public.kraken_private_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own kraken messages" ON public.kraken_private_messages;
CREATE POLICY "Users can update their own kraken messages"
  ON public.kraken_private_messages
  FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "Service role can insert" ON public.kraken_private_messages;
CREATE POLICY "Service role can insert"
  ON public.kraken_private_messages
  FOR INSERT
  TO service_role
  WITH CHECK (true);
