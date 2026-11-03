-- Secure worker authentication and atomic command leasing.
alter table public.mt5_bridge_workers
  add column if not exists worker_token_hash text;

create or replace function public.claim_mt5_bridge_commands(
  p_worker_id text,
  p_lease_seconds integer default 60,
  p_limit integer default 10
)
returns setof public.mt5_bridge_commands
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id
  from public.mt5_bridge_workers
  where worker_id = p_worker_id
    and status in ('online', 'busy')
    and worker_token_hash is not null
  for update;

  if v_user_id is null then
    raise exception 'worker_not_authorized';
  end if;

  return query
  with candidates as (
    select id
    from public.mt5_bridge_commands
    where user_id = v_user_id
      and (
        status = 'queued'
        or (status = 'claimed' and lease_expires_at < now())
      )
    order by created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 25))
  )
  update public.mt5_bridge_commands c
  set status = 'claimed',
      claimed_by = p_worker_id,
      claimed_at = now(),
      lease_expires_at = now() + make_interval(secs => greatest(15, least(coalesce(p_lease_seconds, 60), 300))),
      attempts = attempts + 1
  from candidates
  where c.id = candidates.id
  returning c.*;
end;
$$;

revoke all on function public.claim_mt5_bridge_commands(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_mt5_bridge_commands(text, integer, integer) to service_role;

comment on column public.mt5_bridge_workers.worker_token_hash is
  'SHA-256 hash of a randomly generated per-worker bearer token. The raw token is shown once during secure provisioning and never stored.';
