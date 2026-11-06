alter table public.binance_spot_settings
  add column if not exists risk_percent numeric(5,2) not null default 3
  check (risk_percent > 0 and risk_percent <= 5);

update public.binance_spot_settings
set risk_percent = 3
where risk_percent is null or risk_percent <= 0;

comment on column public.binance_spot_settings.risk_percent is
  'Planned account risk percentage per Binance trade; position quantity is calculated from entry-to-stop distance and capped by free USDT.';
