-- Broker deal-history reconciliation inputs for the MT5 daily risk monitor.
-- Values are recomputed from the broker's UTC-day history on each heartbeat.
alter table public.mt5_daily_risk_snapshots
  add column if not exists cash_flow_adjustment numeric(20,8) not null default 0,
  add column if not exists realized_trading_net numeric(20,8) not null default 0,
  add column if not exists deal_count integer not null default 0,
  add column if not exists history_complete boolean not null default false,
  add column if not exists latest_deal_epoch bigint;

comment on column public.mt5_daily_risk_snapshots.cash_flow_adjustment is
  'Net broker balance/credit/charge/correction/bonus operations since UTC midnight; excluded from daily trading equity change.';
comment on column public.mt5_daily_risk_snapshots.realized_trading_net is
  'Realized deal profit plus commissions, swaps and fees reported by MT5 since UTC midnight.';
comment on column public.mt5_daily_risk_snapshots.history_complete is
  'True only when the MT5 worker successfully queried the full current UTC-day deal history.';
