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

-- Durable per-candle claim prevents duplicate market entries from concurrent
-- worker processes, reconnects or ambiguous broker send outcomes.
create table if not exists public.mt5_five_minute_momentum_bars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.mt5_account_settings(user_id) on delete cascade,
  account_login text not null,
  account_server text not null,
  symbol text not null,
  bar_epoch bigint not null check (bar_epoch > 0 and bar_epoch % 300 = 0),
  direction text not null check (direction in ('BUY','SELL')),
  state text not null default 'claimed'
    check (state in ('claimed','accepted','rejected','uncertain')),
  broker_ticket bigint,
  broker_retcode integer,
  volume numeric(18,8),
  entry_price numeric(28,10),
  broker_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, account_login, account_server, symbol, bar_epoch)
);

create index if not exists mt5_five_minute_momentum_bars_user_idx
  on public.mt5_five_minute_momentum_bars (user_id, created_at desc);

alter table public.mt5_five_minute_momentum_bars enable row level security;
revoke all on public.mt5_five_minute_momentum_bars from anon, authenticated;
grant select, insert, update, delete on public.mt5_five_minute_momentum_bars to service_role;
drop policy if exists "service_all_mt5_five_minute_momentum_bars" on public.mt5_five_minute_momentum_bars;
create policy "service_all_mt5_five_minute_momentum_bars"
  on public.mt5_five_minute_momentum_bars for all
  to service_role using (true) with check (true);

comment on table public.mt5_five_minute_momentum_bars is
  'Service-only idempotency ledger for raw M5 strategy market entries. One claim per member account, broker symbol and M5 candle; uncertain submissions are never blindly resent.';
