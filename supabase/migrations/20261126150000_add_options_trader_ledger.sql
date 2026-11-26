-- Options Trader ledger migration.
-- Creates isolated durable records; no execution endpoint is enabled by this migration.
create table if not exists public.options_trader_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_id text not null,
  account_mode text not null check (account_mode in ('demo','real')),
  contract_kind text not null check (contract_kind in ('ONETOUCH','NOTOUCH','BOTH')),
  stake numeric(18,8) not null check (stake >= 0.35),
  automation_enabled boolean not null default false,
  real_trading_consent_at timestamptz,
  updated_at timestamptz not null default now(),
  check (account_mode <> 'real' or real_trading_consent_at is not null or automation_enabled = false)
);

create table if not exists public.options_proposal_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null,
  account_mode text not null check (account_mode in ('demo','real')),
  proposal_id text not null,
  symbol text not null,
  contract_type text not null check (contract_type in ('ONETOUCH','NOTOUCH')),
  currency text not null,
  stake numeric(18,8) not null check (stake >= 0.35),
  ask_price numeric(18,8) not null check (ask_price > 0),
  payout numeric(18,8) not null check (payout > 0),
  spot numeric(24,12) not null check (spot > 0),
  barrier text not null check (barrier ~ '^[+-][0-9]+(\.[0-9]+)?$'),
  duration_minutes integer not null check (duration_minutes = 30),
  signal_snapshot jsonb not null,
  broker_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  unique (account_id, proposal_id),
  unique (id, user_id),
  check (expires_at > created_at)
);

create index if not exists options_proposals_user_expiry_idx
  on public.options_proposal_snapshots (user_id, expires_at desc);
create index if not exists options_proposals_signal_idx
  on public.options_proposal_snapshots (user_id, (signal_snapshot->>'signalId'));

create table if not exists public.options_execution_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  proposal_record_id uuid not null unique,
  idempotency_key text not null unique,
  status text not null check (status in ('RESERVED','BUY_SENT','UNKNOWN','OPEN','WON','LOST','SOLD','REJECTED')),
  broker_contract_id text unique,
  buy_price numeric(18,8),
  payout numeric(18,8),
  profit_loss numeric(18,8),
  broker_status text,
  last_reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz,
  foreign key (proposal_record_id, user_id)
    references public.options_proposal_snapshots(id, user_id)
);

create index if not exists options_execution_user_status_idx
  on public.options_execution_ledger (user_id, status, created_at desc);
create index if not exists options_execution_contract_idx
  on public.options_execution_ledger (broker_contract_id)
  where broker_contract_id is not null;

create table if not exists public.options_execution_events (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.options_execution_ledger(id) on delete cascade,
  from_status text,
  to_status text not null check (to_status in ('RESERVED','BUY_SENT','UNKNOWN','OPEN','WON','LOST','SOLD','REJECTED')),
  event_type text not null,
  broker_message jsonb,
  created_at timestamptz not null default now()
);

create index if not exists options_execution_events_execution_idx
  on public.options_execution_events (execution_id, created_at);

alter table public.options_trader_settings enable row level security;
alter table public.options_proposal_snapshots enable row level security;
alter table public.options_execution_ledger enable row level security;
alter table public.options_execution_events enable row level security;

revoke all on public.options_trader_settings from anon, authenticated;
revoke all on public.options_proposal_snapshots from anon, authenticated;
revoke all on public.options_execution_ledger from anon, authenticated;
revoke all on public.options_execution_events from anon, authenticated;

grant select, insert, update on public.options_trader_settings to service_role;
grant select, insert on public.options_proposal_snapshots to service_role;
grant update (consumed_at) on public.options_proposal_snapshots to service_role;
grant select, insert, update on public.options_execution_ledger to service_role;
grant select, insert on public.options_execution_events to service_role;
