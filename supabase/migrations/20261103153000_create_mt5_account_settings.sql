-- MT5 account metadata and user-controlled permissions only.
-- Never store MT5 passwords, investor passwords, access tokens, or terminal secrets here.
create table if not exists public.mt5_account_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  login text not null,
  server text not null,
  auto_trade_enabled boolean not null default false,
  adopt_pending_orders boolean not null default false,
  manage_existing_positions boolean not null default false,
  bridge_status text not null default 'not_connected'
    check (bridge_status in ('not_connected', 'connecting', 'connected', 'error')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mt5_account_settings enable row level security;

drop policy if exists "Members can read their own MT5 settings" on public.mt5_account_settings;
create policy "Members can read their own MT5 settings"
  on public.mt5_account_settings for select
  to authenticated using (auth.uid() = user_id);

drop policy if exists "Members can create their own MT5 settings" on public.mt5_account_settings;
create policy "Members can create their own MT5 settings"
  on public.mt5_account_settings for insert
  to authenticated with check (auth.uid() = user_id);

drop policy if exists "Members can update their own MT5 settings" on public.mt5_account_settings;
create policy "Members can update their own MT5 settings"
  on public.mt5_account_settings for update
  to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.mt5_account_settings is
  'MT5 account metadata and permissions only. Supports user-provided demo or live MT5 accounts. Passwords and execution secrets must be handled by the private MT5 bridge and never stored in this table.';
