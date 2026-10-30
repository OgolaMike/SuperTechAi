/*
# Admin access list

1. Plain-English summary
- Adds a list of people who are allowed to open the Admin area.

2. New tables
- `admin_users`: one row per admin, keyed by the user's account id. Rows are created and removed only by the admin tools on the server.

3. Security
- RLS enabled.
- Signed-in users can read only their own row, so the app can tell whether they are an admin.
- Nobody can write to this table from the browser.

4. Notes
- Idempotent: safe to re-run.
- No existing data is changed.
*/

CREATE TABLE IF NOT EXISTS admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON admin_users TO authenticated;
GRANT SELECT, INSERT, DELETE ON admin_users TO service_role;

DROP POLICY IF EXISTS "select_own_admin_row" ON admin_users;
CREATE POLICY "select_own_admin_row" ON admin_users FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "service_select_admin_users" ON admin_users;
CREATE POLICY "service_select_admin_users" ON admin_users FOR SELECT
  TO service_role USING (true);

DROP POLICY IF EXISTS "service_insert_admin_users" ON admin_users;
CREATE POLICY "service_insert_admin_users" ON admin_users FOR INSERT
  TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "service_delete_admin_users" ON admin_users;
CREATE POLICY "service_delete_admin_users" ON admin_users FOR DELETE
  TO service_role USING (true);
