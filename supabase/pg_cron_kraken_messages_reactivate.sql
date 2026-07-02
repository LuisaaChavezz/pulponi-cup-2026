-- Reactiva el cron de kraken-messages (cada 30 min) en producción.
-- Ejecutar en Supabase SQL Editor después de deploy de kraken-messages.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $cron_setup$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid
  INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'kraken-messages-every-30min'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'kraken-messages-every-30min',
    '*/30 * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://lkqvrsnzlfjeppdjtwvm.supabase.co/functions/v1/kraken-messages',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'supabase_service_role_key'
          LIMIT 1
        )
      ),
      body := '{"source":"pg_cron"}'::jsonb
    ) AS request_id;
    $job$
  );

  RAISE NOTICE '[pg_cron] kraken-messages-every-30min reactivado.';
END;
$cron_setup$;
