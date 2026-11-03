-- MT5 bridge command queue and execution audit foundation.
-- All rows are service-role only. Never place MT5 passwords or tokens in these tables.
-- Commands contain order instructions/metadata only; credentials stay in the private worker secret vault.

alter table public.mt5_account_settings
  add column if not exists place_new_orders boolean not null default false;

create table if not exists public.mt5_bridge_workers (
  worker_id text primary key,
  user_id uuid not null references public.mt5_account_settings(user_id) on delete cascade,
  status text not null default 'offline'
    check (status in ('offline', 'online', 'busy', 'error')),
  version text,
  last_seen_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mt5_bridge_workers_user_idx
  on public.mt5_bridge_workers(user_id, last_seen_at desc);

create table if not exists public.mt5_bridge_commands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.mt5_account_settings(user_id) on delete cascade,
  idempotency_key text not null,
  command_type text not null
    check (command_type in (
      'sync_account',
      'list_pending_orders',
      'list_positions',
      'place_pending_order',
      'modify_owned_order',
      'cancel_owned_order',
      'manage_owned_position',
      'pause_trading'
    )),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  status text not null default 'queued'
    check (status in ('queued', 'claimed', 'succeeded', 'failed', 'cancelled')),
  claimed_by text references public.mt5_bridge_workers(worker_id) on delete set null,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  result jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, idempotency_key)
);

create index if not exists mt5_bridge_commands_pending_idx
  on public.mt5_bridge_commands(status, created_at)
  where status in ('queued', 'claimed');

create index if not exists mt5_bridge_commands_user_idx
  on public.mt5_bridge_commands(user_id, created_at desc);

create table if not exists public.mt5_execution_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.mt5_account_settings(user_id) on delete cascade,
  worker_id text,
  event_type text not null,
  idempotency_key text,
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists mt5_execution_audit_user_idx
  on public.mt5_execution_audit(user_id, created_at desc);

alter table public.mt5_bridge_workers enable row level security;
alter table public.mt5_bridge_commands enable row level security;
alter table public.mt5_execution_audit enable row level security;

revoke all on public.mt5_bridge_workers from anon, authenticated;
revoke all on public.mt5_bridge_commands from anon, authenticated;
revoke all on public.mt5_execution_audit from anon, authenticated;

grant select, insert, update, delete on public.mt5_bridge_workers to service_role;
grant select, insert, update, delete on public.mt5_bridge_commands to service_role;
grant select, insert, update, delete on public.mt5_execution_audit to service_role;

drop policy if exists "service_all_mt5_bridge_workers" on public.mt5_bridge_workers;
create policy "service_all_mt5_bridge_workers"
  on public.mt5_bridge_workers for all
  to service_role using (true) with check (true);

drop policy if exists "service_all_mt5_bridge_commands" on public.mt5_bridge_commands;
create policy "service_all_mt5_bridge_commands"
  on public.mt5_bridge_commands for all
  to service_role using (true) with check (true);

drop policy if exists "service_all_mt5_execution_audit" on public.mt5_execution_audit;
create policy "service_all_mt5_execution_audit"
  on public.mt5_execution_audit for all
  to service_role using (true) with check (true);

comment on column public.mt5_account_settings.place_new_orders is
  'Explicit permission to place new MT5 orders. Separate from importing pending orders and managing existing positions.';

comment on table public.mt5_bridge_commands is
  'Private service-role command queue for the MT5 worker. Payloads must contain trade instructions only, never passwords, tokens, or credentials. Idempotency is enforced per member account.';

comment on table public.mt5_execution_audit is
  'Private append-oriented audit trail for MT5 bridge activity. Do not write passwords, tokens, or other secrets to details.';
