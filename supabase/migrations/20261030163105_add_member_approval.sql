/*
# Add member approval

1. Plain-English summary
- New sign-ups can create an account, but they cannot see any app data until an admin approves them.
- Approval is stored in a new list of approved members. Admins are always on that list too.

2. New table
- `member_access`: one row per approved member. `user_id` links to the sign-in account, `approved_at` records when access was granted.
- Browsers can read only their own row, so the app can check whether the signed-in user is approved.

3. Changed access
- `signal_records` (read, add, update), `scanner_state` and `crypto_daily_movers` (read) now require an approved member row, not just any sign-in.
- Existing sign-in accounts are approved automatically so nobody already using the app is locked out.

4. Notes
- Idempotent: safe to re-run.
- No data is deleted or altered.
*/

CREATE TABLE IF NOT EXISTS member_access (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  approved_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE member_access ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON member_access TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON member_access TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON admin_users TO service_role;

DROP POLICY IF EXISTS "select_own_member_access" ON member_access;
CREATE POLICY "select_own_member_access" ON member_access FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

INSERT INTO member_access (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

DROP POLICY IF EXISTS "members_select_signal_records" ON signal_records;
CREATE POLICY "members_select_signal_records" ON signal_records FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM member_access ma WHERE ma.user_id = auth.uid()));

DROP POLICY IF EXISTS "members_insert_signal_records" ON signal_records;
CREATE POLICY "members_insert_signal_records" ON signal_records FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM member_access ma WHERE ma.user_id = auth.uid()));

DROP POLICY IF EXISTS "members_update_signal_records" ON signal_records;
CREATE POLICY "members_update_signal_records" ON signal_records FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM member_access ma WHERE ma.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM member_access ma WHERE ma.user_id = auth.uid()));

DROP POLICY IF EXISTS "members_read_scanner_state" ON scanner_state;
CREATE POLICY "members_read_scanner_state" ON scanner_state FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM member_access ma WHERE ma.user_id = auth.uid()));

DROP POLICY IF EXISTS "members_read_crypto_daily_movers" ON crypto_daily_movers;
CREATE POLICY "members_read_crypto_daily_movers" ON crypto_daily_movers FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM member_access ma WHERE ma.user_id = auth.uid()));
