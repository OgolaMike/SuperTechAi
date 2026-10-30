/*
# Schedule daily crypto movers refresh

Adds a daily job that stores the previous UTC day's top-100 USDT pair movers from Binance.

1. Schedule
- Job name `supertech-crypto-movers` runs at 00:10 UTC every day.
- Re-running this migration replaces the existing job rather than duplicating it.

2. Behaviour
- The refresh function is idempotent: it upserts on (trade_date, symbol), so a repeated run never duplicates rows.

3. Security
- The job calls the function with the public anon key, which the function requires (verify_jwt). The database writes use the service role inside the function.
*/

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'supertech-crypto-movers';

SELECT cron.schedule(
  'supertech-crypto-movers',
  '10 0 * * *',
  $$
  SELECT net.http_post(
    url := 'https://mgfqcnseozncwrkdevlx.supabase.co/functions/v1/crypto-movers',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nZnFjbnNlb3puY3dya2Rldmx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNjAyMDIsImV4cCI6MjEwODkzNjIwMn0.pPv6wFHDm2lkebqIDGnVPpTUNPyj779DtN7bhpgbFU8',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
