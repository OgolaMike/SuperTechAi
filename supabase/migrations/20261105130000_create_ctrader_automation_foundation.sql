-- cTrader account automation foundation.
-- This migration creates metadata, durable execution ledgers and runtime coordination.
-- OAuth access/refresh tokens MUST live in an external secret manager. Only opaque
-- secret references may be stored here. Never store broker passwords or raw tokens.

create table if not exists public.ctrader_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ctrader_account_id text not null,
  environment text not null check (environment in ('demo','live')),
  broker_name text not null default 'Deriv',
  account_label text,
  account_currency text,
  leverage text,
  connection_status text not null default 'pending'
    check (connection_status in ('pending','connected','reauthorization_required','disconnected','error')),
  access_token_secret_ref text,
  refresh_token_secret_ref text,
  token_expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  last_connected_at timestamptz,
  last_seen_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment, ctrader_account_id),
  unique (id, user_id)
);

create index if not exists ctrader_connections_user_idx
  on public.ctrader_connections(user_id, created_at desc);

create table if not exists public.ctrader_execution_settings (
  connection_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  automation_enabled boolean not null default false,
  unattended_execution_enabled boolean not null default false,
  allow_live_execution boolean not null default false,
  risk_per_trade_percent numeric(5,2) not null default 0.50
    check (risk_per_trade_percent between 0.10 and 1.00),
  daily_loss_limit_percent numeric(5,2) not null default 2.00
    check (daily_loss_limit_percent between 0.50 and 5.00),
  max_open_positions integer not null default 1
    check (max_open_positions between 1 and 3),
  max_spread_pips numeric(12,4) not null default 0
    check (max_spread_pips >= 0),
  allowed_symbols text[] not null default '{}',
  strategy_version text not null default 'supertech-ai-v1',
  updated_at timestamptz not null default now(),
  foreign key (connection_id, user_id)
    references public.ctrader_connections(id, user_id) on delete cascade
);

create table if not exists public.ctrader_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_path text not null default '/',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ctrader_oauth_states_expiry_idx
  on public.ctrader_oauth_states(expires_at)
  where consumed_at is null;

create table if not exists public.ctrader_execution_intents (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.ctrader_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_signal_key text not null,
  source_candle_epoch bigint not null check (source_candle_epoch > 0),
  strategy_version text not null,
  symbol text not null,
  timeframe text not null check (timeframe in ('M1','M5','M15','M30','H1','H4','D1','W1')),
  direction text not null check (direction in ('BUY','SELL')),
  order_kind text not null check (order_kind in ('MARKET','LIMIT','STOP')),
  entry_price numeric(28,10),
  stop_loss numeric(28,10) not null check (stop_loss > 0),
  take_profit numeric(28,10) not null check (take_profit > 0),
  risk_percent numeric(5,2) not null check (risk_percent > 0 and risk_percent <= 1),
  idempotency_key text not null,
  status text not null default 'queued'
    check (status in ('queued','leased','submitting','accepted','partially_filled','filled','rejected','uncertain','cancelled','expired')),
  broker_order_id text,
  broker_position_id text,
  expires_at timestamptz,
  request_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(request_payload) = 'object'),
  result_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result_payload) = 'object'),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (connection_id, idempotency_key)
);

create index if not exists ctrader_intents_dispatch_idx
  on public.ctrader_execution_intents(status, created_at)
  where status in ('queued','leased','submitting','uncertain');

create index if not exists ctrader_intents_member_idx
  on public.ctrader_execution_intents(user_id, created_at desc);

create table if not exists public.ctrader_positions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.ctrader_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  broker_position_id text not null,
  broker_order_id text,
  intent_id uuid references public.ctrader_execution_intents(id) on delete set null,
  symbol text not null,
  direction text not null check (direction in ('BUY','SELL')),
  volume numeric(28,10) not null check (volume > 0),
  entry_price numeric(28,10) not null check (entry_price > 0),
  stop_loss numeric(28,10),
  take_profit numeric(28,10),
  position_status text not null default 'open'
    check (position_status in ('open','closing','closed','unknown')),
  strategy_owned boolean not null default false,
  opened_at timestamptz,
  closed_at timestamptz,
  broker_updated_at timestamptz,
  sanitized_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(sanitized_snapshot) = 'object'),
  unique (connection_id, broker_position_id)
);

create index if not exists ctrader_positions_open_idx
  on public.ctrader_positions(connection_id, position_status)
  where position_status in ('open','closing');

create table if not exists public.ctrader_runtime_leases (
  connection_id uuid primary key references public.ctrader_connections(id) on delete cascade,
  lease_owner text not null,
  lease_expires_at timestamptz not null,
  heartbeat_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ctrader_daily_risk_snapshots (
  connection_id uuid not null references public.ctrader_connections(id) on delete cascade,
  risk_date date not null,
  opening_equity numeric(28,10) not null check (opening_equity > 0),
  current_equity numeric(28,10) not null check (current_equity >= 0),
  realized_pnl numeric(28,10) not null default 0,
  unrealized_pnl numeric(28,10) not null default 0,
  loss_limit_reached boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (connection_id, risk_date)
);

create table if not exists public.ctrader_execution_events (
  id bigint generated always as identity primary key,
  connection_id uuid references public.ctrader_connections(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  intent_id uuid references public.ctrader_execution_intents(id) on delete set null,
  event_type text not null,
  idempotency_key text,
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists ctrader_execution_events_user_idx
  on public.ctrader_execution_events(user_id, created_at desc);

-- Member-facing tables: members can read their own records. Settings are editable
-- only by their owner; connection creation and all execution writes stay server-side.
alter table public.ctrader_connections enable row level security;
alter table public.ctrader_execution_settings enable row level security;
alter table public.ctrader_oauth_states enable row level security;
alter table public.ctrader_execution_intents enable row level security;
alter table public.ctrader_positions enable row level security;
alter table public.ctrader_runtime_leases enable row level security;
alter table public.ctrader_daily_risk_snapshots enable row level security;
alter table public.ctrader_execution_events enable row level security;

revoke all on public.ctrader_connections from anon, authenticated;
revoke all on public.ctrader_oauth_states from anon, authenticated;
revoke all on public.ctrader_runtime_leases from anon, authenticated;
revoke all on public.ctrader_execution_events from anon, authenticated;
revoke all on public.ctrader_execution_intents from anon, authenticated;
revoke all on public.ctrader_positions from anon, authenticated;
revoke all on public.ctrader_daily_risk_snapshots from anon, authenticated;

grant select on public.ctrader_connections to authenticated;
grant select, insert, update on public.ctrader_execution_settings to authenticated;
grant select on public.ctrader_execution_intents to authenticated;
grant select on public.ctrader_positions to authenticated;
grant select on public.ctrader_daily_risk_snapshots to authenticated;
grant select on public.ctrader_execution_events to authenticated;

grant all on public.ctrader_connections to service_role;
grant all on public.ctrader_execution_settings to service_role;
grant all on public.ctrader_oauth_states to service_role;
grant all on public.ctrader_execution_intents to service_role;
grant all on public.ctrader_positions to service_role;
grant all on public.ctrader_runtime_leases to service_role;
grant all on public.ctrader_daily_risk_snapshots to service_role;
grant all on public.ctrader_execution_events to service_role;

drop policy if exists "members_read_own_ctrader_connection" on public.ctrader_connections;
create policy "members_read_own_ctrader_connection"
  on public.ctrader_connections for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "members_manage_own_ctrader_settings" on public.ctrader_execution_settings;
create policy "members_manage_own_ctrader_settings"
  on public.ctrader_execution_settings for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "members_read_own_ctrader_intents" on public.ctrader_execution_intents;
create policy "members_read_own_ctrader_intents"
  on public.ctrader_execution_intents for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "members_read_own_ctrader_positions" on public.ctrader_positions;
create policy "members_read_own_ctrader_positions"
  on public.ctrader_positions for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "members_read_own_ctrader_risk" on public.ctrader_daily_risk_snapshots;
create policy "members_read_own_ctrader_risk"
  on public.ctrader_daily_risk_snapshots for select to authenticated
  using (exists (
    select 1 from public.ctrader_connections c
    where c.id = connection_id and c.user_id = auth.uid()
  ));

drop policy if exists "members_read_own_ctrader_events" on public.ctrader_execution_events;
create policy "members_read_own_ctrader_events"
  on public.ctrader_execution_events for select to authenticated
  using (auth.uid() = user_id);

comment on table public.ctrader_connections is
  'cTrader OAuth-linked account metadata. Broker tokens are stored in an external secret manager; only secret references are stored here.';
comment on table public.ctrader_execution_intents is
  'Durable idempotent signal-to-order ledger. Service-role writes only; an intent is not proof of broker acceptance.';
comment on table public.ctrader_positions is
  'Broker-reconciled position inventory. Strategy ownership is explicit; manual/unowned positions must never be modified.';
comment on table public.ctrader_runtime_leases is
  'Per-account worker lease prevents two execution workers managing the same cTrader account concurrently.';
comment on table public.ctrader_execution_events is
  'Service-only execution audit trail. Never include access tokens, refresh tokens, passwords or other secrets.';
