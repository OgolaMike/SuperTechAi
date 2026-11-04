-- Cover two foreign keys and cache auth.uid() once per statement in MT5 policies.
BEGIN;

CREATE INDEX IF NOT EXISTS mt5_bridge_commands_claimed_by_idx
  ON public.mt5_bridge_commands (claimed_by)
  WHERE claimed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS mt5_execution_attempts_worker_id_idx
  ON public.mt5_execution_attempts (worker_id)
  WHERE worker_id IS NOT NULL;

DROP POLICY IF EXISTS "Members can read their own MT5 settings" ON public.mt5_account_settings;
CREATE POLICY "Members can read their own MT5 settings"
ON public.mt5_account_settings FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Members can create their own MT5 settings" ON public.mt5_account_settings;
CREATE POLICY "Members can create their own MT5 settings"
ON public.mt5_account_settings FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Members can update their own MT5 settings" ON public.mt5_account_settings;
CREATE POLICY "Members can update their own MT5 settings"
ON public.mt5_account_settings FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

COMMIT;
