-- Optional raw M5 Higher High / Lower Low market strategy.
-- All settings fail closed; no existing member is opted in automatically.
alter table public.mt5_account_settings
  add column if not exists five_minute_momentum_enabled boolean not null default false,
  add column if not exists five_minute_momentum_symbol text,
  add column if not exists five_minute_momentum_lot_size numeric(18,8) not null default 0.1;

alter table public.mt5_account_settings
  add constraint mt5_five_minute_momentum_symbol_length_check
    check (five_minute_momentum_symbol is null or length(btrim(five_minute_momentum_symbol)) between 1 and 40),
  add constraint mt5_five_minute_momentum_lot_size_check
    check (five_minute_momentum_lot_size > 0 and five_minute_momentum_lot_size <= 1000);

comment on column public.mt5_account_settings.five_minute_momentum_enabled is
  'Explicit member opt-in for the independent raw MT5 M5 Higher High / Lower Low strategy. Defaults off; other MT5 execution gates remain mandatory.';
comment on column public.mt5_account_settings.five_minute_momentum_symbol is
  'Exact broker-specific MT5 symbol for Five Minute Momentum, including any broker suffix.';
comment on column public.mt5_account_settings.five_minute_momentum_lot_size is
  'Requested fixed lot size for Five Minute Momentum before broker min/max/step normalization. Not a risk guarantee.';
