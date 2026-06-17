-- pg_cron: invoca la Edge Function sync-football-scores cada 5 minutos.
-- Requiere extensiones pg_cron y pg_net (Dashboard → Database → Extensions).
--
-- 1) Desplegar la función:
--      supabase functions deploy sync-football-scores
--      supabase secrets set FOOTBALL_API_KEY=... VITE_FOOTBALL_LEAGUE_ID=1 VITE_FOOTBALL_SEASON=2026
--
-- 2) Crear secretos en Vault (Dashboard → Project Settings → Vault), o SQL:
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
  WHERE jobname = 'sync-football-scores-5min'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'sync-football-scores-5min',
    '*/5 * * * *',
    $job$
    SELECT net.http_post(
      url := (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'supabase_project_url'
        LIMIT 1
      ) || '/functions/v1/sync-football-scores',
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

  RAISE NOTICE '[pg_cron] Job sync-football-scores-5min programado (cada 5 min).';
END;
$cron_setup$;

-- Verificar:
--   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'sync-football-scores-5min';
-- Historial reciente:
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
