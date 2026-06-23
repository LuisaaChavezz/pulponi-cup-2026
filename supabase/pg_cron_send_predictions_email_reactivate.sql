-- Reactivar cron de predicciones (cada 5 min).
-- Ejecutar en Supabase SQL Editor después de deploy de send-predictions-email.
-- Requiere: pg_cron, pg_net, tabla email_logs (supabase/email_logs.sql).

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $reactivate$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid
  INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'send-predictions-every-5min'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'send-predictions-every-5min',
    '*/5 * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://lkqvrsnzlfjeppdjtwvm.supabase.co/functions/v1/send-predictions-email',
      headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrcXZyc256bGZqZXBwZGp0d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MDk1MDUsImV4cCI6MjA5NDM4NTUwNX0.gyZN9aTaAcweWWlYUBP-YLC7i7hH5H_cZLHwhV3bB4Q", "Content-Type": "application/json"}'::jsonb,
      body := '{"source":"pg_cron"}'::jsonb
    ) AS request_id;
    $job$
  );

  RAISE NOTICE '[pg_cron] send-predictions-every-5min reactivado.';
END;
$reactivate$;

-- Verificar:
-- SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'send-predictions-every-5min';
