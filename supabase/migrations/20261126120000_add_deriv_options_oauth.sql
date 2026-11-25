-- Deriv OAuth state is short-lived and service-role only.
create table if not exists public.deriv_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_verifier text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists deriv_oauth_states_expiry_idx on public.deriv_oauth_states (expires_at);
alter table public.deriv_oauth_states enable row level security;
revoke all on public.deriv_oauth_states from anon, authenticated;

-- Only encrypted Deriv credentials are persisted. Account metadata is non-secret.
create table if not exists public.deriv_oauth_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_access_token text not null,
  token_expires_at timestamptz not null,
  accounts jsonb not null default '[]'::jsonb,
  connection_status text not null default 'connected' check (connection_status in ('connected','disconnected')),
  updated_at timestamptz not null default now()
);
alter table public.deriv_oauth_grants enable row level security;
revoke all on public.deriv_oauth_grants from anon, authenticated;

-- Service role is the only role allowed to read/write OAuth state and encrypted tokens.
grant all on public.deriv_oauth_states to service_role;
grant all on public.deriv_oauth_grants to service_role;