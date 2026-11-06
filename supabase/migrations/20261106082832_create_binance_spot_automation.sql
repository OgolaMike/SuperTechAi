create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.binance_spot_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_api_key text not null,
  encrypted_api_secret text not null,
  api_key_last4 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table private.binance_spot_credentials enable row level security;
revoke all on private.binance_spot_credentials from public, anon, authenticated;
grant select, insert, update, delete on private.binance_spot_credentials to service_role;

create table if not exists public.binance_spot_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  connection_status text not null default 'not_connected'
    check (connection_status in ('not_connected','connected','error')),
  auto_trade_enabled boolean not null default false,
  live_execution_enabled boolean not null default false,
  emergency_stop boolean not null default true,
  quote_asset text not null default 'USDT' check (quote_asset = 'USDT'),
  max_trade_usdt numeric(18,8) not null default 25
    check (max_trade_usdt > 0 and max_trade_usdt <= 100000),
  max_open_positions integer not null default 3
    check (max_open_positions between 1 and 20),
  allowed_symbols text[] not null default '{}',
  api_key_last4 text,
  account_label text,
  last_checked_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.binance_spot_settings enable row level security;
revoke all on public.binance_spot_settings from anon, authenticated;
grant select on public.binance_spot_settings to authenticated;
create policy "members_read_own_binance_spot_settings"
  on public.binance_spot_settings for select to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.binance_spot_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  side text not null check (side in ('BUY','SELL')),
  order_kind text not null check (order_kind in ('LIMIT','OTOCO')),
  entry_price numeric(28,12) not null check (entry_price > 0),
  quantity numeric(28,12) not null check (quantity > 0),
  stop_loss numeric(28,12),
  take_profit numeric(28,12),
  signal_key text not null,
  idempotency_key text not null,
  status text not null default 'queued'
    check (status in ('queued','submitted','partially_filled','filled','rejected','uncertain','cancelled','expired','closed')),
  broker_order_id text,
  broker_order_list_id text,
  client_order_id text not null,
  request_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(request_payload) = 'object'),
  result_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(result_payload) = 'object'),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, idempotency_key),
  unique (user_id, client_order_id)
);
create index if not exists binance_spot_orders_user_status_idx
  on public.binance_spot_orders(user_id, status, created_at desc);
create index if not exists binance_spot_orders_symbol_idx
  on public.binance_spot_orders(symbol, created_at desc);
alter table public.binance_spot_orders enable row level security;
revoke all on public.binance_spot_orders from anon, authenticated;
grant select on public.binance_spot_orders to authenticated;
create policy "members_read_own_binance_spot_orders"
  on public.binance_spot_orders for select to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.binance_spot_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  base_asset text not null,
  quote_asset text not null default 'USDT',
  quantity numeric(28,12) not null check (quantity >= 0),
  entry_price numeric(28,12) not null check (entry_price > 0),
  stop_loss numeric(28,12),
  take_profit numeric(28,12),
  entry_order_id uuid references public.binance_spot_orders(id) on delete set null,
  exit_order_list_id text,
  status text not null default 'open' check (status in ('open','closing','closed','unknown')),
  strategy_owned boolean not null default true,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists binance_spot_positions_user_status_idx
  on public.binance_spot_positions(user_id, status);
alter table public.binance_spot_positions enable row level security;
revoke all on public.binance_spot_positions from anon, authenticated;
grant select on public.binance_spot_positions to authenticated;
create policy "members_read_own_binance_spot_positions"
  on public.binance_spot_positions for select to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.binance_spot_settings to service_role;
grant select, insert, update, delete on public.binance_spot_orders to service_role;
grant select, insert, update, delete on public.binance_spot_positions to service_role;
