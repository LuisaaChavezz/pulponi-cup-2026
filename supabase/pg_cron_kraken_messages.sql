-- pg_cron: invoca la Edge Function kraken-messages cada 30 minutos.
-- Requiere extensiones pg_cron y pg_net (Dashboard → Database → Extensions).
--
-- 1) Desplegar la función:
--      supabase functions deploy kraken-messages
--
-- 2) Secretos en Vault (si aún no existen para sync-football-scores):
--      select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'supabase_project_url');
--      select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'supabase_service_role_key');
--
-- 3) Ejecutar este script en el SQL Editor.

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
      url := (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'supabase_project_url'
        LIMIT 1
      ) || '/functions/v1/kraken-messages',
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

  RAISE NOTICE '[pg_cron] Job kraken-messages-every-30min programado (cada 30 min).';
END;
$cron_setup$;

-- Verificar:
--   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'kraken-messages-every-30min';

-- Alternativa manual (reemplaza TU_PROJECT_REF y TU_SERVICE_ROLE_KEY):
-- SELECT net.http_post(
--   url := 'https://TU_PROJECT_REF.supabase.co/functions/v1/kraken-messages',
--   headers := jsonb_build_object(
--     'Content-Type', 'application/json',
--     'Authorization', 'Bearer TU_SERVICE_ROLE_KEY'
--   ),
--   body := '{"source":"manual"}'::jsonb
-- );
