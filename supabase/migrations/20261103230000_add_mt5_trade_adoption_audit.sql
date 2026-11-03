create table if not exists public.mt5_trade_adoption_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_login text not null,
  account_server text not null,
  object_type text not null check (object_type in ('pending_order','position')),
  ticket bigint not null,
  action text not null check (action in ('adopt','revoke')),
  previous_status text not null,
  new_status text not null,
  created_at timestamptz not null default now()
);
alter table public.mt5_trade_adoption_audit enable row level security;
revoke all on public.mt5_trade_adoption_audit from anon, authenticated;
grant select, insert on public.mt5_trade_adoption_audit to service_role;
create index if not exists mt5_trade_adoption_audit_user_created_idx
  on public.mt5_trade_adoption_audit(user_id, created_at desc);
comment on table public.mt5_trade_adoption_audit is
  'Append-only service-role audit of explicit member adoption and revocation of individual MT5 broker objects.';
