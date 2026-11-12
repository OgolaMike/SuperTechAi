-- The scanner cron secret is provisioned separately in Supabase Vault.
-- Never put the secret value in migrations, source control, or logs.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'supertech_scanner_cron_secret'
  ) THEN
    RAISE EXCEPTION 'Required scanner cron secret is not provisioned in Vault';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.verify_scanner_cron_secret(p_secret text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    p_secret IS NOT NULL
    AND length(p_secret) >= 32
    AND EXISTS (
      SELECT 1
      FROM vault.decrypted_secrets AS s
      WHERE s.name = 'supertech_scanner_cron_secret'
        AND s.decrypted_secret = p_secret
    ),
    false
  );
$function$;

REVOKE ALL ON FUNCTION public.verify_scanner_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_scanner_cron_secret(text) TO service_role;

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
      body := '{}'::jsonb
    );
  $command$
);
