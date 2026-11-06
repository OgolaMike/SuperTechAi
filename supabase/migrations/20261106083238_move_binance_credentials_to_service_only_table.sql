create table if not exists public.binance_spot_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_api_key text not null,
  encrypted_api_secret text not null,
  api_key_last4 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.binance_spot_credentials enable row level security;
revoke all on public.binance_spot_credentials from public, anon, authenticated;
grant select, insert, update, delete on public.binance_spot_credentials to service_role;
drop table if exists private.binance_spot_credentials;
