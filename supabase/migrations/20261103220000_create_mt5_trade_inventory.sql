-- Persistent read-only inventory of MT5 orders and positions.
-- Discovery never grants ownership or permission to modify broker objects.
create table if not exists public.mt5_trade_inventory (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.mt5_account_settings(user_id) on delete cascade,
  account_login text not null,
  account_server text not null,
  object_type text not null check (object_type in ('pending_order','position')),
  ticket bigint not null,
  identifier bigint,
  symbol text not null,
  side_or_type integer not null,
  volume numeric(20,8) not null default 0,
  price_open numeric(20,10) not null default 0,
  price_current numeric(20,10),
  stop_loss numeric(20,10),
  take_profit numeric(20,10),
  profit numeric(20,8),
  magic_number bigint not null default 0,
  broker_reason integer,
  broker_comment text not null default '',
  ownership_status text not null default 'discovered_unowned'
    check (ownership_status in ('discovered_unowned','strategy_tagged_unverified','explicitly_adopted','strategy_owned')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_sync_id text,
  unique (user_id, account_login, account_server, object_type, ticket)
);

create index if not exists mt5_trade_inventory_user_seen_idx
  on public.mt5_trade_inventory(user_id, last_seen_at desc);
create index if not exists mt5_trade_inventory_account_status_idx
  on public.mt5_trade_inventory(user_id, account_login, account_server, ownership_status);

alter table public.mt5_trade_inventory enable row level security;
revoke all on public.mt5_trade_inventory from anon, authenticated;
grant select, insert, update, delete on public.mt5_trade_inventory to service_role;
drop policy if exists "service_all_mt5_trade_inventory" on public.mt5_trade_inventory;
create policy "service_all_mt5_trade_inventory"
  on public.mt5_trade_inventory for all
  to service_role using (true) with check (true);

comment on table public.mt5_trade_inventory is
  'Service-only read-only MT5 inventory. Discovery does not adopt or authorize modification of any broker order or position.';
comment on column public.mt5_trade_inventory.ownership_status is
  'Newly discovered items remain unowned. Strategy tags are unverified until a later explicit ownership verification workflow.';
