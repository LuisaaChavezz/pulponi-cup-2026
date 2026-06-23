-- Invocar una vez el correo de bienvenida / presentación del sistema de notificaciones.
-- Requiere: pg_net + función desplegada send-welcome-email + RESEND_API_KEY en Secrets.
--
-- Deploy:
--   supabase functions deploy send-welcome-email --project-ref lkqvrsnzlfjeppdjtwvm

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT net.http_post(
  url := 'https://lkqvrsnzlfjeppdjtwvm.supabase.co/functions/v1/send-welcome-email',
  headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrcXZyc256bGZqZXBwZGp0d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MDk1MDUsImV4cCI6MjA5NDM4NTUwNX0.gyZN9aTaAcweWWlYUBP-YLC7i7hH5H_cZLHwhV3bB4Q", "Content-Type": "application/json"}'::jsonb,
  body := '{}'::jsonb
);
