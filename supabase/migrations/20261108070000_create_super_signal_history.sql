create table if not exists public.super_signal_records (
  signal_key text primary key,
  symbol text not null,
  asset_name text not null,
  digits integer not null default 4,
  direction text not null check (direction in ('BUY','SELL')),
  signal_epoch bigint not null,
  entry double precision not null,
  stop_loss double precision not null,
  tp1 double precision not null,
  tp2 double precision not null,
  tp3 double precision not null,
  band_mean double precision not null default 0,
  band_deviation double precision not null default 0,
  daily_bias text not null default 'No data',
  reads jsonb not null default '[]'::jsonb,
  explanation text not null default '',
  status text not null default 'Open' check (status in ('Open','TP1','TP2','TP3','Stopped','Reversed')),
  tp1_hit_epoch bigint,
  tp2_hit_epoch bigint,
  tp3_hit_epoch bigint,
  sl_hit_epoch bigint,
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists super_signal_records_epoch_idx
  on public.super_signal_records (signal_epoch desc);
create index if not exists super_signal_records_symbol_epoch_idx
  on public.super_signal_records (symbol, signal_epoch desc);

alter table public.super_signal_records enable row level security;
grant select, insert on public.super_signal_records to authenticated;

drop policy if exists members_select_super_signal_records on public.super_signal_records;
create policy members_select_super_signal_records
on public.super_signal_records for select to authenticated
using (
  exists (select 1 from public.member_access ma where ma.user_id = (select auth.uid()))
  or exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
);

drop policy if exists members_insert_super_signal_records on public.super_signal_records;
create policy members_insert_super_signal_records
on public.super_signal_records for insert to authenticated
with check (
  exists (select 1 from public.member_access ma where ma.user_id = (select auth.uid()))
  or exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
);

create or replace function public.sync_super_signal_outcome()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.super_signal_records ss
  set
    status = new.status,
    tp1_hit_epoch = new.tp1_hit_epoch,
    tp2_hit_epoch = new.tp2_hit_epoch,
    tp3_hit_epoch = new.tp3_hit_epoch,
    sl_hit_epoch = new.sl_hit_epoch,
    closed = new.closed,
    updated_at = now()
  where ss.signal_key = new.symbol || '|' || new.granularity::text || '|' ||
    new.signal_epoch::text || '|' || new.direction;
  return new;
end;
$$;

drop trigger if exists sync_super_signal_outcome_trigger on public.signal_records;
create trigger sync_super_signal_outcome_trigger
after update of status, tp1_hit_epoch, tp2_hit_epoch, tp3_hit_epoch, sl_hit_epoch, closed
on public.signal_records
for each row execute function public.sync_super_signal_outcome();

create or replace function public.hydrate_super_signal_outcome()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  source_row public.signal_records%rowtype;
begin
  select * into source_row
  from public.signal_records sr
  where sr.signal_key = new.signal_key;

  if found then
    new.status := source_row.status;
    new.tp1_hit_epoch := source_row.tp1_hit_epoch;
    new.tp2_hit_epoch := source_row.tp2_hit_epoch;
    new.tp3_hit_epoch := source_row.tp3_hit_epoch;
    new.sl_hit_epoch := source_row.sl_hit_epoch;
    new.closed := source_row.closed;
  end if;
  return new;
end;
$$;

drop trigger if exists hydrate_super_signal_outcome_trigger on public.super_signal_records;
create trigger hydrate_super_signal_outcome_trigger
before insert on public.super_signal_records
for each row execute function public.hydrate_super_signal_outcome();
