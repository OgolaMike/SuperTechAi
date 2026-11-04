-- Keep shared market data read-only to app clients.
-- Only the trusted scanner Edge Function (service_role) may write signal rows.
-- Approved members and administrators may read shared signals and service health.
BEGIN;

DROP POLICY IF EXISTS members_insert_signal_records ON public.signal_records;
DROP POLICY IF EXISTS members_update_signal_records ON public.signal_records;
DROP POLICY IF EXISTS members_select_signal_records ON public.signal_records;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.signal_records FROM anon, authenticated;
GRANT SELECT ON TABLE public.signal_records TO authenticated;
GRANT ALL ON TABLE public.signal_records TO service_role;

CREATE POLICY members_select_signal_records
ON public.signal_records
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.member_access ma
    WHERE ma.user_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS members_read_scanner_state ON public.scanner_state;
CREATE POLICY members_read_scanner_state
ON public.scanner_state
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.member_access ma
    WHERE ma.user_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS members_read_crypto_daily_movers ON public.crypto_daily_movers;
CREATE POLICY members_read_crypto_daily_movers
ON public.crypto_daily_movers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.member_access ma
    WHERE ma.user_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS select_own_admin_row ON public.admin_users;
CREATE POLICY select_own_admin_row
ON public.admin_users
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS select_own_member_access ON public.member_access;
CREATE POLICY select_own_member_access
ON public.member_access
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

COMMIT;
