/*
# Scanner health and Web Push persistence

1. Plain-English summary
- Adds the tables a 24/7 backend scanner and Web Push delivery need.
- Scanner health is readable by the app so members can see whether scanning is running.
- Everything used for push delivery is server-only and never readable from the browser.

2. New tables
- `scanner_state`: one row ('main') with connection status, last run, last successful data update, last scan and last error.
- `scanner_candle_marks`: last confirmed candle processed per symbol and timeframe, so restarts do not reprocess candles.
- `push_config`: VAPID key pair used to sign push requests (service role only).
- `push_subscriptions`: browser push endpoints with notification preferences, keyed by endpoint.
- `push_events`: each confirmed event (new signal or target/stop hit) with a unique key, so each event is sent once.

3. Security
- RLS enabled on every table.
- `scanner_state`: SELECT for anon and authenticated (health only, no secrets); no write grants.
- All other tables: no anon or authenticated grants. Only service_role can read or write them.

4. Notes
- Idempotent: safe to re-run.
- No data is deleted or altered.
*/

CREATE TABLE IF NOT EXISTS scanner_state (
  id text PRIMARY KEY,
  connection_status text NOT NULL DEFAULT 'idle',
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_scan_symbols integer NOT NULL DEFAULT 0,
  last_scan_signals integer NOT NULL DEFAULT 0,
  last_error text,
  last_error_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scanner_candle_marks (
  symbol text NOT NULL,
  granularity integer NOT NULL,
  last_candle_epoch bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, granularity)
);

CREATE TABLE IF NOT EXISTS push_config (
  id text PRIMARY KEY,
  public_key text NOT NULL,
  private_jwk jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint text PRIMARY KEY,
  p256dh text NOT NULL,
  auth text NOT NULL,
  notify_signals boolean NOT NULL DEFAULT true,
  notify_targets boolean NOT NULL DEFAULT true,
  notify_stops boolean NOT NULL DEFAULT true,
  user_agent text,
  failure_count integer NOT NULL DEFAULT 0,
  last_error text,
  last_success_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_events (
  event_key text PRIMARY KEY,
  signal_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('signal', 'target', 'stop')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz
);

CREATE INDEX IF NOT EXISTS push_events_pending_idx ON push_events (created_at) WHERE dispatched_at IS NULL;

ALTER TABLE scanner_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE scanner_candle_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON scanner_state TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON scanner_state TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON scanner_candle_marks, push_config, push_subscriptions, push_events TO service_role;

DROP POLICY IF EXISTS "public_read_scanner_state" ON scanner_state;
CREATE POLICY "public_read_scanner_state" ON scanner_state FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "service_all_scanner_state" ON scanner_state;
CREATE POLICY "service_all_scanner_state" ON scanner_state FOR ALL
  TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_scanner_candle_marks" ON scanner_candle_marks;
CREATE POLICY "service_all_scanner_candle_marks" ON scanner_candle_marks FOR ALL
  TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_push_config" ON push_config;
CREATE POLICY "service_all_push_config" ON push_config FOR ALL
  TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_push_subscriptions" ON push_subscriptions;
CREATE POLICY "service_all_push_subscriptions" ON push_subscriptions FOR ALL
  TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_push_events" ON push_events;
CREATE POLICY "service_all_push_events" ON push_events FOR ALL
  TO service_role USING (true) WITH CHECK (true);

INSERT INTO scanner_state (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;
