-- Explicit live execution gate and durable broker execution audit.
-- All new fields fail closed. Live execution is never enabled by pairing.
alter table public.mt5_account_settings
  add column if not exists live_execution_enabled boolean not null default false,
  add column if not exists emergency_stop boolean not null default true;

comment on column public.mt5_account_settings.live_execution_enabled is
  'Separate explicit member switch for broker order placement. Defaults off, including on account pairing.';
comment on column public.mt5_account_settings.emergency_stop is
  'Fail-closed master stop. When true, the worker must refuse every new order. Defaults on.';

create table if not exists public.mt5_execution_attempts (
  command_id uuid primary key references public.mt5_bridge_commands(id) on delete cascade,
  user_id uuid not null references public.mt5_account_settings(user_id) on delete cascade,
  worker_id text not null references public.mt5_bridge_workers(worker_id) on delete restrict,
  state text not null check (state in ('dispatching','accepted','rejected','uncertain')),
  account_login text not null,
  account_server text not null,
  broker_comment text not null,
  broker_ticket bigint,
  broker_deal bigint,
  broker_retcode integer,
  broker_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, account_login, account_server, broker_comment)
);

alter table public.mt5_execution_attempts enable row level security;
revoke all on public.mt5_execution_attempts from anon, authenticated;
grant select, insert, update, delete on public.mt5_execution_attempts to service_role;
drop policy if exists "service_all_mt5_execution_attempts" on public.mt5_execution_attempts;
create policy "service_all_mt5_execution_attempts"
  on public.mt5_execution_attempts for all
  to service_role using (true) with check (true);

comment on table public.mt5_execution_attempts is
  'Service-only execution attempt audit. Persisted dispatching attempt plus broker comment reconciliation prevent blind resubmission after uncertain send outcomes.';
