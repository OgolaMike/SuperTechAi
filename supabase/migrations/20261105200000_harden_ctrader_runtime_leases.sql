-- Keep one persistent gateway owner per cTrader account.
-- A worker may renew its own lease; another worker may claim only after expiry.
create or replace function public.claim_ctrader_runtime_lease(
  p_connection_id uuid,
  p_lease_owner text,
  p_ttl_seconds integer default 45
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean := false;
begin
  if p_lease_owner is null or length(trim(p_lease_owner)) = 0 then
    raise exception 'lease_owner_required';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds < 10 or p_ttl_seconds > 300 then
    raise exception 'lease_ttl_out_of_range';
  end if;

  insert into public.ctrader_runtime_leases (
    connection_id, lease_owner, lease_expires_at, heartbeat_at, updated_at
  )
  values (
    p_connection_id, p_lease_owner,
    now() + make_interval(secs => p_ttl_seconds), now(), now()
  )
  on conflict (connection_id) do update
    set lease_owner = excluded.lease_owner,
        lease_expires_at = excluded.lease_expires_at,
        heartbeat_at = now(),
        updated_at = now()
    where public.ctrader_runtime_leases.lease_expires_at < now()
       or public.ctrader_runtime_leases.lease_owner = p_lease_owner
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.release_ctrader_runtime_lease(
  p_connection_id uuid,
  p_lease_owner text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.ctrader_runtime_leases
  where connection_id = p_connection_id
    and lease_owner = p_lease_owner;
  return found;
end;
$$;

revoke all on function public.claim_ctrader_runtime_lease(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.release_ctrader_runtime_lease(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_ctrader_runtime_lease(uuid, text, integer) to service_role;
grant execute on function public.release_ctrader_runtime_lease(uuid, text) to service_role;
