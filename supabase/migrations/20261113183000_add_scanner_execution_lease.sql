-- Prevent overlapping scanner runs and keep the lease recoverable after an Edge Runtime crash.
create table if not exists public.scanner_execution_leases (
  lease_name text primary key check (lease_name = 'main'),
  lease_token uuid not null,
  lease_until timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.scanner_execution_leases enable row level security;
revoke all on public.scanner_execution_leases from public, anon, authenticated;
grant select, insert, update, delete on public.scanner_execution_leases to service_role;

create or replace function public.acquire_scanner_lease(
  p_lease_token uuid,
  p_ttl_seconds integer default 120
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  acquired boolean;
begin
  if p_lease_token is null or p_ttl_seconds < 30 or p_ttl_seconds > 180 then
    raise exception 'invalid_scanner_lease_parameters';
  end if;

  insert into public.scanner_execution_leases (lease_name, lease_token, lease_until, updated_at)
  values ('main', p_lease_token, now() + make_interval(secs => p_ttl_seconds), now())
  on conflict (lease_name) do update
    set lease_token = excluded.lease_token,
        lease_until = excluded.lease_until,
        updated_at = now()
    where public.scanner_execution_leases.lease_until < now()
       or public.scanner_execution_leases.lease_token = excluded.lease_token
  returning true into acquired;

  return coalesce(acquired, false);
end;
$$;

create or replace function public.release_scanner_lease(p_lease_token uuid)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  released_count integer;
begin
  if p_lease_token is null then
    return false;
  end if;

  delete from public.scanner_execution_leases
  where lease_name = 'main'
    and lease_token = p_lease_token;

  get diagnostics released_count = row_count;
  return released_count = 1;
end;
$$;

revoke all on function public.acquire_scanner_lease(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_scanner_lease(uuid) from public, anon, authenticated;
grant execute on function public.acquire_scanner_lease(uuid, integer) to service_role;
grant execute on function public.release_scanner_lease(uuid) to service_role;
