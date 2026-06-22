-- Registro de correos automáticos (predicciones / resultados).
-- Ejecutar en Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.email_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id text NOT NULL,
  type text NOT NULL,
  sent_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (match_id, type)
);

CREATE INDEX IF NOT EXISTS email_logs_match_type_idx ON public.email_logs (match_id, type);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.email_logs IS 'Evita reenvíos duplicados de correos por partido y tipo.';
