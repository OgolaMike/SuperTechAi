-- Persist a per-member UTC-day equity baseline for Futures daily-loss enforcement.
-- This table is service-role only; no client policies are intentionally created.
create table if not exists public.binance_futures_daily_equity (
  user_id uuid not null references auth.users(id) on delete cascade,
  trading_day date not null,
  baseline_equity numeric(30, 10) not null check (baseline_equity > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, trading_day)
);

alter table public.binance_futures_daily_equity enable row level security;
revoke all on table public.binance_futures_daily_equity from anon, authenticated;
grant all on table public.binance_futures_daily_equity to service_role;
