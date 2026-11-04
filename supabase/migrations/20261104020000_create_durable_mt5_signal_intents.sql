-- Durable, service-only queue for future signal-driven MT5 execution.
-- This migration intentionally does not enable unattended trading or dispatch orders.
alter table public.mt5_account_settings
  add column if not exists unattended_execution_enabled boolean not null default false;

comment on column public.mt5_account_settings.unattended_execution_enabled is
  'Separate opt-in for future unattended signal-driven pending orders. Defaults off and has no effect until the server-side intent pipeline is deployed.';

create table if not exists public.mt5_signal_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.mt5_account_settings(user_id) on delete cascade,
  account_login text not null,
  account_server text not null,
  source_signal_key text not null,
  strategy_version text not null,
  symbol text not null,
  timeframe text not null check (timeframe in ('M1','M5','M15','M30','H1','H2','H4','D1')),
  signal_epoch bigint not null check (signal_epoch > 0),
  direction text not null check (direction in ('BUY','SELL')),
  order_type text not null check (order_type in ('BUY_STOP','SELL_STOP','BUY_LIMIT','SELL_LIMIT')),
  entry numeric(28,10) not null check (entry > 0),
  stop_loss numeric(28,10) not null check (stop_loss > 0),
  take_profit numeric(28,10) not null check (take_profit > 0),
  idempotency_key text not null,
  status text not null default 'pending_review'
    check (status in ('pending_review','queued','dispatching','accepted','rejected','uncertain','expired','cancelled')),
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, account_login, account_server, idempotency_key),
  check (
    (order_type in ('BUY_STOP','BUY_LIMIT') and direction = 'BUY')
    or (order_type in ('SELL_STOP','SELL_LIMIT') and direction = 'SELL')
  )
);

create index if not exists mt5_signal_intents_dispatch_idx
  on public.mt5_signal_intents (status, created_at)
  where status in ('queued','dispatching');

create index if not exists mt5_signal_intents_account_idx
  on public.mt5_signal_intents (user_id, account_login, account_server, created_at desc);

alter table public.mt5_signal_intents enable row level security;
revoke all on public.mt5_signal_intents from anon, authenticated;
grant select, insert, update, delete on public.mt5_signal_intents to service_role;
drop policy if exists "service_all_mt5_signal_intents" on public.mt5_signal_intents;
create policy "service_all_mt5_signal_intents"
  on public.mt5_signal_intents for all
  to service_role using (true) with check (true);

comment on table public.mt5_signal_intents is
  'Durable, idempotent signal-to-order intent ledger. Service-role only. Creating an intent does not authorize or execute a broker order.';
