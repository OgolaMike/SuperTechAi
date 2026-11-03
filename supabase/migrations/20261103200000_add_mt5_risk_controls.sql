-- Member-scoped MT5 risk limits and explicit execution permissions.
-- Defaults fail closed: no trade permission, no adopted positions, no risk engine enablement.
alter table public.mt5_account_settings
  add column if not exists risk_controls_enabled boolean not null default false,
  add column if not exists max_risk_per_trade_pct numeric(5,2) not null default 0.50,
  add column if not exists max_daily_loss_pct numeric(5,2) not null default 2.00,
  add column if not exists max_open_positions integer not null default 3,
  add column if not exists max_spread_points integer not null default 0,
  add column if not exists max_slippage_points integer not null default 0;

alter table public.mt5_account_settings
  drop constraint if exists mt5_risk_per_trade_range,
  add constraint mt5_risk_per_trade_range
    check (max_risk_per_trade_pct > 0 and max_risk_per_trade_pct <= 2.00),
  drop constraint if exists mt5_daily_loss_range,
  add constraint mt5_daily_loss_range
    check (max_daily_loss_pct > 0 and max_daily_loss_pct <= 5.00),
  drop constraint if exists mt5_max_open_positions_range,
  add constraint mt5_max_open_positions_range
    check (max_open_positions between 1 and 20),
  drop constraint if exists mt5_max_spread_points_range,
  add constraint mt5_max_spread_points_range
    check (max_spread_points between 0 and 100000),
  drop constraint if exists mt5_max_slippage_points_range,
  add constraint mt5_max_slippage_points_range
    check (max_slippage_points between 0 and 100000);

comment on column public.mt5_account_settings.risk_controls_enabled is
  'Member acknowledgement that risk limits are configured. This does not enable order execution by itself.';
comment on column public.mt5_account_settings.max_risk_per_trade_pct is
  'Maximum planned account-equity risk for one new trade, as a percentage. Default 0.50%.';
comment on column public.mt5_account_settings.max_daily_loss_pct is
  'Daily equity-loss stop threshold as a percentage of the UTC-day starting equity. Default 2.00%.';
comment on column public.mt5_account_settings.max_open_positions is
  'Maximum number of strategy-owned open positions allowed by the future execution policy.';
comment on column public.mt5_account_settings.max_spread_points is
  'Required broker spread ceiling in symbol points. Zero blocks future execution until explicitly configured.';
comment on column public.mt5_account_settings.max_slippage_points is
  'Maximum allowed execution deviation in symbol points. Zero blocks future execution until explicitly configured.';
