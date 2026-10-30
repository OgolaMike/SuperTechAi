/*
# Require sign-in for app data

1. Plain-English summary
- The public key that ships with the website can no longer read or change signal records, scanner health or crypto movers. Only signed-in users can.
- Background tables used only by the server (push keys, subscriptions, events, scanner progress) are closed to the browser entirely.

2. Changed access
- `signal_records`: browser read, insert and update limited to signed-in users (previously open to anyone).
- `scanner_state`, `crypto_daily_movers`: read limited to signed-in users.
- `push_config`, `push_events`, `push_subscriptions`, `scanner_candle_marks`: all browser access removed; the server keeps full access.

3. Notes
- Idempotent: safe to re-run.
- No data is deleted or altered. Server functions use their own privileged access and are unaffected.
*/

REVOKE ALL ON signal_records, scanner_state, crypto_daily_movers FROM anon;

GRANT SELECT, INSERT, UPDATE ON signal_records TO authenticated;
GRANT SELECT ON scanner_state, crypto_daily_movers TO authenticated;

DROP POLICY IF EXISTS "anon_insert_signal_records" ON signal_records;
DROP POLICY IF EXISTS "anon_select_signal_records" ON signal_records;
DROP POLICY IF EXISTS "anon_update_signal_records" ON signal_records;

DROP POLICY IF EXISTS "members_select_signal_records" ON signal_records;
CREATE POLICY "members_select_signal_records" ON signal_records FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "members_insert_signal_records" ON signal_records;
CREATE POLICY "members_insert_signal_records" ON signal_records FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "members_update_signal_records" ON signal_records;
CREATE POLICY "members_update_signal_records" ON signal_records FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public_read_scanner_state" ON scanner_state;
DROP POLICY IF EXISTS "members_read_scanner_state" ON scanner_state;
CREATE POLICY "members_read_scanner_state" ON scanner_state FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "public_read_crypto_daily_movers" ON crypto_daily_movers;
DROP POLICY IF EXISTS "members_read_crypto_daily_movers" ON crypto_daily_movers;
CREATE POLICY "members_read_crypto_daily_movers" ON crypto_daily_movers FOR SELECT
  TO authenticated USING (true);

REVOKE ALL ON push_config, push_events, push_subscriptions, scanner_candle_marks FROM anon, authenticated;
