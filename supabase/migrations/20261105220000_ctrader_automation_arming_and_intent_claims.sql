-- Member-confirmed arming and durable, single-worker intent claiming.
alter table public.ctrader_execution_intents
  add column if not exists execution_lease_owner text,
  add column if not exists execution_lease_expires_at timestamptz,
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0),
  add column if not exists last_attempt_at timestamptz;

create index if not exists ctrader_intents_lease_idx
  on public.ctrader_execution_intents(connection_id, status, execution_lease_expires_at, created_at)
  where status in ('queued','leased');

-- A logged-in account owner must explicitly arm automation. For a live account,
-- the caller must separately confirm live trading in the same deliberate action.
create or replace function public.arm_ctrader_automation(
  p_connection_id uuid,
  p_confirm_live_trading boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_environment text;
  v_status text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  select environment, connection_status
    into v_environment, v_status
  from public.ctrader_connections
  where id = p_connection_id and user_id = auth.uid()
  for update;

  if not found then raise exception 'ctrader_connection_not_found'; end if;
  if v_status <> 'connected' then raise exception 'ctrader_account_not_connected'; end if;
  if v_environment = 'live' and coalesce(p_confirm_live_trading, false) is not true then
    raise exception 'explicit_live_confirmation_required';
  end if;

  update public.ctrader_execution_settings
  set automation_enabled = true,
      unattended_execution_enabled = true,
      allow_live_execution = (v_environment = 'live' and p_confirm_live_trading),
      updated_at = now()
  where connection_id = p_connection_id and user_id = auth.uid();

  if not found then raise exception 'ctrader_execution_settings_missing'; end if;

  insert into public.ctrader_execution_events(connection_id,user_id,event_type,details)
  values (
    p_connection_id, auth.uid(), 'automation_armed',
    jsonb_build_object('environment',v_environment,'liveTradingConfirmed',(v_environment='live' and p_confirm_live_trading))
  );
  return true;
end;
$$;

create or replace function public.disarm_ctrader_automation(p_connection_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  update public.ctrader_execution_settings
  set automation_enabled = false,
      unattended_execution_enabled = false,
      updated_at = now()
  where connection_id = p_connection_id and user_id = auth.uid();

  if not found then raise exception 'ctrader_connection_not_found'; end if;

  insert into public.ctrader_execution_events(connection_id,user_id,event_type,details)
  values (p_connection_id,auth.uid(),'automation_disarmed','{}'::jsonb);

  return true;
end;
$$;

-- The gateway may claim one eligible intent only while it owns the account lease.
-- An expired worker lease can be reclaimed; submitting/uncertain orders are never
-- automatically retried because a broker acknowledgement may have been lost.
create or replace function public.claim_ctrader_execution_intent(
  p_connection_id uuid,
  p_lease_owner text,
  p_ttl_seconds integer default 30
)
returns setof public.ctrader_execution_intents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent_id uuid;
begin
  if p_ttl_seconds is null or p_ttl_seconds < 10 or p_ttl_seconds > 120 then
    raise exception 'intent_lease_ttl_out_of_range';
  end if;

  if not exists (
    select 1 from public.ctrader_runtime_leases l
    where l.connection_id = p_connection_id
      and l.lease_owner = p_lease_owner
      and l.lease_expires_at > now()
  ) then
    return;
  end if;

  select i.id into v_intent_id
  from public.ctrader_execution_intents i
  join public.ctrader_connections c on c.id = i.connection_id
  join public.ctrader_execution_settings s on s.connection_id = c.id
  where i.connection_id = p_connection_id
    and c.connection_status = 'connected'
    and s.automation_enabled = true
    and s.unattended_execution_enabled = true
    and (c.environment <> 'live' or s.allow_live_execution = true)
    and i.expires_at is null or (
      i.connection_id = p_connection_id
      and c.connection_status = 'connected'
      and s.automation_enabled = true
      and s.unattended_execution_enabled = true
      and (c.environment <> 'live' or s.allow_live_execution = true)
      and i.expires_at > now()
    )
    and (
      i.status = 'queued'
      or (i.status = 'leased' and i.execution_lease_expires_at < now())
    )
  order by i.created_at
  for update of i skip locked
  limit 1;

  if v_intent_id is null then return; end if;

  return query
  update public.ctrader_execution_intents
  set status = 'leased',
      execution_lease_owner = p_lease_owner,
      execution_lease_expires_at = now() + make_interval(secs => p_ttl_seconds),
      attempt_count = attempt_count + 1,
      last_attempt_at = now(),
      updated_at = now()
  where id = v_intent_id
  returning *;
end;
$$;

revoke all on function public.arm_ctrader_automation(uuid, boolean) from public, anon;
revoke all on function public.disarm_ctrader_automation(uuid) from public, anon;
revoke all on function public.claim_ctrader_execution_intent(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.arm_ctrader_automation(uuid, boolean) to authenticated;
grant execute on function public.disarm_ctrader_automation(uuid) to authenticated;
grant execute on function public.claim_ctrader_execution_intent(uuid, text, integer) to service_role;
