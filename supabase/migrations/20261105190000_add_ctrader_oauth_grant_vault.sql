-- Encrypted cTrader OAuth grants. Tokens are application-encrypted before they reach Postgres.
create table if not exists public.ctrader_oauth_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  token_expires_at timestamptz not null,
  granted_scopes text[] not null default '{}',
  status text not null default 'account_discovery_pending'
    check (status in ('account_discovery_pending','active','reauthorization_required','revoked','error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ctrader_oauth_grants_user_idx
  on public.ctrader_oauth_grants(user_id, created_at desc);
alter table public.ctrader_oauth_grants enable row level security;
revoke all on public.ctrader_oauth_grants from anon, authenticated;
grant all on public.ctrader_oauth_grants to service_role;
