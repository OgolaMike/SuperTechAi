alter table public.binance_spot_orders add column if not exists expires_at timestamptz;
