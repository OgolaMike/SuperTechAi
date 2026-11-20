-- SuperTech AI Trader: durable, fail-closed signal and per-member execution intent foundation.
-- This migration creates storage only. It does not enqueue broker orders, enable automation,
-- alter live_execution_enabled, or change any existing member permissions.

create table if not exists public.trader_signal_intents (
  id uuid primary key default gen_random_uuid(),
  signal_key text not null unique,
  symbol text not null,
  direction text not null check (direction in ('BUY', 'SELL')),
  strategy_version text not null,
  primary_timeframe text not null default 'H4' check (primary_timeframe = 'H4'),
  confirmation_timeframe text not null default 'M15' check (confirmation_timeframe = 'M15'),
  signal_epoch bigint not null,
  entry_price numeric(24,10) not null check (entry_price > 0),
  stop_loss numeric(24,10) not null check (stop_loss > 0),
  take_profit numeric(24,10) not null check (take_profit > 0),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  explanation text,
  status text not null default 'observed'
    check (status in ('observed', 'confirmed', 'invalidated', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (direction = 'BUY' and stop_loss < entry_price and take_profit > entry_price)
    or
    (direction = 'SELL' and stop_loss > entry_price and take_profit < entry_price)
  )
);

create index if not exists trader_signal_intents_recent_idx
  on public.trader_signal_intents(status, signal_epoch desc);
create index if not exists trader_signal_intents_symbol_idx
  on public.trader_signal_intents(symbol, signal_epoch desc);

create table if not exists public.trader_member_execution_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.mt5_account_settings(user_id) on delete cascade,
  signal_intent_id uuid not null references public.trader_signal_intents(id) on delete restrict,
  idempotency_key text not null,
  status text not null default 'awaiting_policy'
    check (status in (
      'awaiting_policy', 'blocked', 'approved', 'queued',
      'submitted', 'accepted', 'rejected', 'uncertain', 'cancelled'
    )),
  policy_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(policy_snapshot) = 'object'),
  risk_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(risk_snapshot) = 'object'),
  block_reason text,
  bridge_command_id uuid references public.mt5_bridge_commands(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  unique (user_id, signal_intent_id)
);

create index if not exists trader_member_execution_intents_user_recent_idx
  on public.trader_member_execution_intents(user_id, created_at desc);
create index if not exists trader_member_execution_intents_queue_idx
  on public.trader_member_execution_intents(status, created_at)
  where status in ('approved', 'queued', 'submitted', 'uncertain');

-- Private service-role pipeline. Members cannot directly create or approve execution intents.
alter table public.trader_signal_intents enable row level security;
alter table public.trader_member_execution_intents enable row level security;
revoke all on public.trader_signal_intents from anon, authenticated;
revoke all on public.trader_member_execution_intents from anon, authenticated;
grant select, insert, update, delete on public.trader_signal_intents to service_role;
grant select, insert, update, delete on public.trader_member_execution_intents to service_role;

drop policy if exists "service_all_trader_signal_intents" on public.trader_signal_intents;
create policy "service_all_trader_signal_intents"
  on public.trader_signal_intents for all
  to service_role using (true) with check (true);

drop policy if exists "service_all_trader_member_execution_intents" on public.trader_member_execution_intents;
create policy "service_all_trader_member_execution_intents"
  on public.trader_member_execution_intents for all
  to service_role using (true) with check (true);

comment on table public.trader_signal_intents is
  'Canonical multi-market H4 signal evidence with M15 confirmation metadata. Storage only; no broker execution is triggered by insert.';
comment on table public.trader_member_execution_intents is
  'One idempotent, member-specific decision record per canonical signal. Must be checked against current account permissions and risk limits before any bridge command is created.';
