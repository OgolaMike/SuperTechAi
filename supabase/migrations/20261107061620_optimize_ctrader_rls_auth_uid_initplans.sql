-- Preserve the existing per-user cTrader access rules while avoiding
-- per-row re-evaluation of auth.uid() in RLS policy expressions.

alter policy members_read_own_ctrader_connection
on public.ctrader_connections
using ((select auth.uid()) = user_id);

alter policy members_read_own_ctrader_events
on public.ctrader_execution_events
using ((select auth.uid()) = user_id);

alter policy members_read_own_ctrader_intents
on public.ctrader_execution_intents
using ((select auth.uid()) = user_id);

alter policy members_manage_own_ctrader_settings
on public.ctrader_execution_settings
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter policy members_read_own_ctrader_positions
on public.ctrader_positions
using ((select auth.uid()) = user_id);

alter policy members_read_own_ctrader_risk
on public.ctrader_daily_risk_snapshots
using (
  exists (
    select 1
    from public.ctrader_connections c
    where c.id = ctrader_daily_risk_snapshots.connection_id
      and c.user_id = (select auth.uid())
  )
);
