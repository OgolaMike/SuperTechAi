-- pg_net defaults to a 2-second request timeout. The scanner is a bounded,
-- resumable batch worker, so allow its HTTP request to complete within the
-- Edge Function wall-clock limit instead of timing out at the pg_net default.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'supertech-scanner'
  ) THEN
    RAISE EXCEPTION 'Required cron job supertech-scanner does not exist';
  END IF;
END
$$;

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'supertech-scanner'),
  command := $command$
    SELECT net.http_post(
      url := 'https://jtfsqhewotinvlrcadwq.supabase.co/functions/v1/scanner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Scanner-Cron-Secret', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'supertech_scanner_cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $command$
);
