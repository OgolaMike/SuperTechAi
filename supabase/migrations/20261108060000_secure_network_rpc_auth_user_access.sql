-- Keep member-network RPCs service-role-only while allowing their owner context
-- to read auth.users for display names. The network Edge Function validates the
-- caller's JWT before invoking these RPCs and checks admin_users before using
-- the full directory RPC.
alter function public.finance_get_network(uuid) security definer;
alter function public.finance_get_network(uuid) set search_path = '';

alter function public.finance_get_all_network_members() security definer;
alter function public.finance_get_all_network_members() set search_path = '';

revoke all on function public.finance_get_network(uuid) from public, anon, authenticated;
grant execute on function public.finance_get_network(uuid) to service_role;

revoke all on function public.finance_get_all_network_members() from public, anon, authenticated;
grant execute on function public.finance_get_all_network_members() to service_role;

comment on function public.finance_get_network(uuid) is
  'Service-role-only RPC. The network Edge Function validates the caller JWT before invoking it.';
comment on function public.finance_get_all_network_members() is
  'Service-role-only admin directory RPC. The network Edge Function validates the caller JWT and admin_users membership before invoking it.';

-- Preserve the existing academy-admin insert checks while allowing auth.uid()
-- to be evaluated once per statement instead of once per candidate row.
alter policy "academy admins can publish video records"
on public.academy_videos
with check (
  status = 'completed'
  and created_by = (select auth.uid())
  and video_url is not null
  and exists (
    select 1
    from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);
