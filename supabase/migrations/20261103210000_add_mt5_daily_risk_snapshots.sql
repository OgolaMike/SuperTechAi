-- UTC-day account equity snapshots for future daily-loss enforcement.
-- Service role only; snapshots are not directly writable by members or workers.
create table if not exists public.mt5_daily_risk_snapshots (
  user_id uuid not null references public.mt5_account_settings(user_id) on delete cascade,
  utc_date date not null,
  starting_balance numeric(20, 8) not null check (starting_balance > 0),
  starting_equity numeric(20, 8) not null check (starting_equity > 0),
  latest_balance numeric(20, 8) not null check (latest_balance > 0),
  latest_equity numeric(20, 8) not null check (latest_equity > 0),
  daily_equity_change_pct numeric(10, 4) not null default 0,
  first_observed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, utc_date)
);

alter table public.mt5_daily_risk_snapshots enable row level security;
revoke all on public.mt5_daily_risk_snapshots from anon, authenticated;
grant select, insert, update, delete on public.mt5_daily_risk_snapshots to service_role;
drop policy if exists "service_all_mt5_daily_risk_snapshots" on public.mt5_daily_risk_snapshots;
create policy "service_all_mt5_daily_risk_snapshots"
  on public.mt5_daily_risk_snapshots for all
  to service_role using (true) with check (true);

comment on table public.mt5_daily_risk_snapshots is
  'Service-only UTC-day opening and latest equity snapshots for MT5 risk monitoring. First observation is the baseline; deposits/withdrawals and late first observations require separate handling before automated enforcement.';
