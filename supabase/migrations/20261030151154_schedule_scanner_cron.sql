/*
# Schedule the 24/7 signal scanner

Runs the scanner edge function every minute using pg_cron, so signal generation and push delivery continue with no browser open.

1. Extensions
- pg_cron (job scheduler) and pg_net (outbound HTTP from the database) are enabled.

2. Schedule
- Job name `supertech-scanner` runs at every minute and calls the scanner function.
- Re-running this migration replaces the existing job rather than creating a duplicate.

3. Security
- The call uses the public anon key, which the scanner function requires to be presented (verify_jwt). The scanner itself writes with the service role key held inside the function.
- No user data is exposed by this migration.

4. Notes
- Scanner runs are idempotent: candle progress, signal keys and push event keys are unique, so overlapping or retried runs do not create duplicates.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'supertech-scanner';

SELECT cron.schedule(
  'supertech-scanner',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mgfqcnseozncwrkdevlx.supabase.co/functions/v1/scanner',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nZnFjbnNlb3puY3dya2Rldmx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNjAyMDIsImV4cCI6MjEwODkzNjIwMn0.pPv6wFHDm2lkebqIDGnVPpTUNPyj779DtN7bhpgbFU8',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
