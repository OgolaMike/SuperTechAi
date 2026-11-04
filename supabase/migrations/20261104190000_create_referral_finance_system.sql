create schema if not exists private;

create table if not exists public.finance_settings (
  id smallint primary key default 1 check (id=1),
  network text not null default 'TRC20' check (network='TRC20'),
  membership_price numeric(18,6) not null default 300 check (membership_price=300),
  withdrawal_fee_pct numeric(5,2) not null default 15 check (withdrawal_fee_pct between 0 and 100),
  owner_share_pct numeric(5,2) not null default 35 check (owner_share_pct between 0 and 100),
  direct_pct numeric(5,2) not null default 30 check (direct_pct between 0 and 100),
  infinity_pct numeric(5,2) not null default 20 check (infinity_pct between 0 and 100),
  unilevel_pct numeric(5,2) not null default 10 check (unilevel_pct between 0 and 100),
  lucky_pct numeric(5,2) not null default 5 check (lucky_pct between 0 and 100),
  third_plus_direct_pct numeric(5,2) not null default 50 check (third_plus_direct_pct between 0 and 100),
  treasury_address text,
  usdt_contract text not null default 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  payment_expiry_minutes integer not null default 120 check (payment_expiry_minutes between 5 and 1440),
  updated_at timestamptz not null default now()
);
insert into public.finance_settings(id) values(1) on conflict(id) do nothing;

create table if not exists public.finance_owner_accounts (
  owner_slot smallint primary key check(owner_slot between 1 and 5),
  display_name text not null,
  user_id uuid references auth.users(id) on delete set null,
  payout_address text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.finance_owner_accounts(owner_slot,display_name)
values(1,'Owner 1'),(2,'Owner 2'),(3,'Owner 3'),(4,'Owner 4'),(5,'Owner 5')
on conflict(owner_slot) do nothing;

create table if not exists public.finance_member_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  referral_code text not null unique,
  sponsor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_no_self_sponsor check(sponsor_user_id is null or sponsor_user_id<>user_id)
);
create index if not exists finance_member_profiles_sponsor_idx on public.finance_member_profiles(sponsor_user_id);

create table if not exists public.finance_payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sponsor_user_id uuid references auth.users(id) on delete set null,
  referral_code text,
  amount numeric(18,6) not null default 300 check(amount=300),
  network text not null default 'TRC20' check(network='TRC20'),
  token_contract text not null default 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  treasury_address text not null,
  payer_address text,
  tx_hash text unique,
  status text not null default 'pending' check(status in ('pending','confirmed','expired','rejected','under_review')),
  chain_payload jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default(now()+interval '2 hours'),
  confirmed_at timestamptz,
  constraint finance_payment_tx_required_when_confirmed check(status<>'confirmed' or (tx_hash is not null and confirmed_at is not null))
);
create index if not exists finance_payment_orders_user_idx on public.finance_payment_orders(user_id,created_at desc);
create index if not exists finance_payment_orders_pending_idx on public.finance_payment_orders(status,created_at) where status='pending';
create index if not exists finance_payment_sponsor_idx on public.finance_payment_orders(sponsor_user_id);

create table if not exists public.finance_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  account_code text not null,
  user_id uuid references auth.users(id) on delete set null,
  owner_slot smallint references public.finance_owner_accounts(owner_slot),
  payment_order_id uuid references public.finance_payment_orders(id) on delete restrict,
  withdrawal_id uuid,
  entry_type text not null,
  amount numeric(18,6) not null check(amount<>0),
  currency text not null default 'USDT' check(currency='USDT'),
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists finance_ledger_account_idx on public.finance_ledger_entries(account_code,created_at desc);
create index if not exists finance_ledger_payment_idx on public.finance_ledger_entries(payment_order_id);
create index if not exists finance_ledger_owner_slot_idx on public.finance_ledger_entries(owner_slot);
create index if not exists finance_ledger_user_idx on public.finance_ledger_entries(user_id);

create table if not exists public.finance_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  owner_slot smallint references public.finance_owner_accounts(owner_slot),
  account_code text not null,
  gross_amount numeric(18,6) not null check(gross_amount>0),
  fee_amount numeric(18,6) not null check(fee_amount>=0),
  net_amount numeric(18,6) not null check(net_amount>0),
  destination_address text not null,
  status text not null default 'pending' check(status in ('pending','approved','processing','paid','rejected')),
  tx_hash text unique,
  rejection_reason text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null,
  constraint finance_withdrawal_exactly_one_owner check((user_id is not null and owner_slot is null) or (user_id is null and owner_slot is not null))
);
create index if not exists finance_withdrawals_status_idx on public.finance_withdrawal_requests(status,requested_at desc);
create index if not exists finance_withdrawal_owner_slot_idx on public.finance_withdrawal_requests(owner_slot);
create index if not exists finance_withdrawal_processed_by_idx on public.finance_withdrawal_requests(processed_by);
create index if not exists finance_withdrawal_user_idx on public.finance_withdrawal_requests(user_id);

create table if not exists public.finance_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists finance_audit_actor_idx on public.finance_audit_log(actor_user_id);

alter table public.finance_settings enable row level security;
alter table public.finance_owner_accounts enable row level security;
alter table public.finance_member_profiles enable row level security;
alter table public.finance_payment_orders enable row level security;
alter table public.finance_ledger_entries enable row level security;
alter table public.finance_withdrawal_requests enable row level security;
alter table public.finance_audit_log enable row level security;

revoke all on public.finance_settings,public.finance_owner_accounts,public.finance_member_profiles,public.finance_payment_orders,public.finance_ledger_entries,public.finance_withdrawal_requests,public.finance_audit_log from anon,authenticated;
grant all on public.finance_settings,public.finance_owner_accounts,public.finance_member_profiles,public.finance_payment_orders,public.finance_ledger_entries,public.finance_withdrawal_requests,public.finance_audit_log to service_role;
grant usage,select on sequence public.finance_audit_log_id_seq to service_role;

do $$
declare t text;
begin
  foreach t in array array['finance_settings','finance_owner_accounts','finance_member_profiles','finance_payment_orders','finance_ledger_entries','finance_withdrawal_requests','finance_audit_log'] loop
    execute format('drop policy if exists finance_service_role_all on public.%I',t);
    execute format('create policy finance_service_role_all on public.%I for all to service_role using (true) with check (true)',t);
  end loop;
end $$;

create or replace function private.create_finance_member_profile()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_code text;
begin
  v_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.finance_member_profiles(user_id,referral_code) values(new.id,v_code) on conflict(user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.create_finance_member_profile() from public,anon,authenticated;
drop trigger if exists on_auth_user_created_finance_profile on auth.users;
create trigger on_auth_user_created_finance_profile after insert on auth.users
for each row execute function private.create_finance_member_profile();

create or replace function public.finance_settle_membership(p_order_id uuid,p_tx_hash text,p_chain_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_order public.finance_payment_orders%rowtype;
  v_settings public.finance_settings%rowtype;
  v_direct_count integer:=0;
  v_direct_pct numeric(5,2);
  v_infinity_pct numeric(5,2);
  v_sponsor uuid;
  v_owner_amount numeric(18,6);
  v_direct_amount numeric(18,6);
  v_infinity_amount numeric(18,6);
  v_unilevel_amount numeric(18,6);
  v_lucky_amount numeric(18,6);
  v_slot smallint;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  select * into v_order from public.finance_payment_orders where id=p_order_id for update;
  if not found then raise exception 'payment_order_not_found'; end if;
  if v_order.status='confirmed' then return jsonb_build_object('ok',true,'already_confirmed',true,'order_id',v_order.id); end if;
  if v_order.status<>'pending' then raise exception 'payment_order_not_pending'; end if;
  if v_order.expires_at<now() then update public.finance_payment_orders set status='expired' where id=v_order.id; raise exception 'payment_order_expired'; end if;
  if p_tx_hash is null or length(trim(p_tx_hash))<>64 then raise exception 'invalid_transaction_hash'; end if;
  if exists(select 1 from public.finance_payment_orders where tx_hash=lower(trim(p_tx_hash)) and id<>p_order_id) then raise exception 'transaction_already_used'; end if;
  select * into v_settings from public.finance_settings where id=1;
  if v_settings.id is null then raise exception 'finance_settings_missing'; end if;
  v_sponsor:=v_order.sponsor_user_id;
  if v_sponsor is not null then
    select count(distinct p.user_id)::integer into v_direct_count from public.finance_payment_orders p
    join public.finance_member_profiles mp on mp.user_id=p.user_id
    where mp.sponsor_user_id=v_sponsor and p.status='confirmed' and p.id<>p_order_id;
  end if;
  if v_direct_count>=2 then v_direct_pct:=v_settings.third_plus_direct_pct; v_infinity_pct:=0;
  else v_direct_pct:=v_settings.direct_pct; v_infinity_pct:=v_settings.infinity_pct; end if;
  v_owner_amount:=round(v_order.amount*(v_settings.owner_share_pct/100)/5,6);
  v_direct_amount:=round(v_order.amount*(v_direct_pct/100),6);
  v_infinity_amount:=round(v_order.amount*(v_infinity_pct/100),6);
  v_unilevel_amount:=round(v_order.amount*(v_settings.unilevel_pct/100),6);
  v_lucky_amount:=round(v_order.amount*(v_settings.lucky_pct/100),6);
  update public.finance_payment_orders set status='confirmed',tx_hash=lower(trim(p_tx_hash)),chain_payload=coalesce(p_chain_payload,'{}'::jsonb),confirmed_at=now() where id=p_order_id;
  insert into public.finance_ledger_entries(account_code,payment_order_id,entry_type,amount,idempotency_key,metadata)
  values
    ('company:membership_revenue',v_order.id,'membership_revenue',v_order.amount,'payment:'||v_order.id::text||':revenue','{"kind":"gross_revenue"}'::jsonb),
    ('company:treasury_inflow',v_order.id,'treasury_inflow',v_order.amount,'payment:'||v_order.id::text||':treasury_inflow','{"network":"TRC20"}'::jsonb);
  for v_slot in 1..5 loop
    insert into public.finance_ledger_entries(account_code,owner_slot,payment_order_id,entry_type,amount,idempotency_key,metadata)
    values('owner:'||v_slot::text,v_slot,v_order.id,'owner_share',v_owner_amount,'payment:'||v_order.id::text||':owner:'||v_slot::text,jsonb_build_object('share_pct',v_settings.owner_share_pct/5));
  end loop;
  if v_sponsor is not null then
    insert into public.finance_ledger_entries(account_code,user_id,payment_order_id,entry_type,amount,idempotency_key,metadata)
    values('member:'||v_sponsor::text,v_sponsor,v_order.id,'direct_commission',v_direct_amount,'payment:'||v_order.id::text||':direct',jsonb_build_object('rate_pct',v_direct_pct,'direct_referrals_before_sale',v_direct_count));
  else
    insert into public.finance_ledger_entries(account_code,payment_order_id,entry_type,amount,idempotency_key,metadata)
    values('pool:unallocated_referral',v_order.id,'unallocated_referral',v_direct_amount,'payment:'||v_order.id::text||':unallocated_direct','{"reason":"no_referrer"}'::jsonb);
  end if;
  if v_infinity_amount>0 then
    insert into public.finance_ledger_entries(account_code,payment_order_id,entry_type,amount,idempotency_key,metadata)
    values('pool:infinity',v_order.id,'infinity_pool',v_infinity_amount,'payment:'||v_order.id::text||':infinity',jsonb_build_object('rate_pct',v_infinity_pct));
  end if;
  if v_unilevel_amount>0 then
    insert into public.finance_ledger_entries(account_code,payment_order_id,entry_type,amount,idempotency_key,metadata)
    values('pool:unilevel',v_order.id,'unilevel_pool',v_unilevel_amount,'payment:'||v_order.id::text||':unilevel',jsonb_build_object('rate_pct',v_settings.unilevel_pct));
  end if;
  if v_lucky_amount>0 then
    insert into public.finance_ledger_entries(account_code,payment_order_id,entry_type,amount,idempotency_key,metadata)
    values('pool:lucky',v_order.id,'lucky_pool',v_lucky_amount,'payment:'||v_order.id::text||':lucky',jsonb_build_object('rate_pct',v_settings.lucky_pct));
  end if;
  insert into public.member_access(user_id,approved_at) values(v_order.user_id,now())
  on conflict(user_id) do update set approved_at=excluded.approved_at;
  insert into public.finance_audit_log(actor_user_id,event_type,entity_type,entity_id,details)
  values(null,'membership_payment_confirmed','payment_order',v_order.id::text,jsonb_build_object('user_id',v_order.user_id,'tx_hash',lower(trim(p_tx_hash)),'amount',v_order.amount));
  return jsonb_build_object('ok',true,'order_id',v_order.id,'user_id',v_order.user_id,'direct_amount',case when v_sponsor is null then 0 else v_direct_amount end,'infinity_amount',v_infinity_amount,'owner_share_each',v_owner_amount,'activated',true);
end;
$$;

create or replace function public.finance_create_withdrawal(p_user_id uuid,p_owner_slot smallint,p_gross_amount numeric,p_destination_address text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_settings public.finance_settings%rowtype; v_account_code text; v_balance numeric(18,6); v_fee numeric(18,6); v_net numeric(18,6); v_request_id uuid; v_owner_user uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if p_gross_amount is null or p_gross_amount<=0 then raise exception 'invalid_withdrawal_amount'; end if;
  if p_destination_address !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$' then raise exception 'invalid_tron_address'; end if;
  select * into v_settings from public.finance_settings where id=1;
  if p_owner_slot is not null then
    select user_id into v_owner_user from public.finance_owner_accounts where owner_slot=p_owner_slot and active=true;
    if v_owner_user is null or v_owner_user<>p_user_id then raise exception 'owner_account_not_linked'; end if;
    v_account_code:='owner:'||p_owner_slot::text;
  else
    if p_user_id is null then raise exception 'user_required'; end if;
    v_account_code:='member:'||p_user_id::text;
  end if;
  select coalesce(sum(amount),0) into v_balance from public.finance_ledger_entries where account_code=v_account_code;
  if p_gross_amount>v_balance then raise exception 'insufficient_available_balance'; end if;
  v_fee:=round(p_gross_amount*(v_settings.withdrawal_fee_pct/100),6); v_net:=round(p_gross_amount-v_fee,6);
  if v_net<=0 then raise exception 'net_withdrawal_too_small'; end if;
  insert into public.finance_withdrawal_requests(user_id,owner_slot,account_code,gross_amount,fee_amount,net_amount,destination_address)
  values(case when p_owner_slot is null then p_user_id else null end,p_owner_slot,v_account_code,p_gross_amount,v_fee,v_net,p_destination_address) returning id into v_request_id;
  insert into public.finance_ledger_entries(account_code,user_id,owner_slot,withdrawal_id,entry_type,amount,idempotency_key)
  values
    (v_account_code,case when p_owner_slot is null then p_user_id else null end,p_owner_slot,v_request_id,'withdrawal_debit',-p_gross_amount,'withdrawal:'||v_request_id::text||':debit'),
    ('company:operations_pending',null,null,v_request_id,'withdrawal_fee_pending',v_fee,'withdrawal:'||v_request_id::text||':fee_pending'),
    ('company:withdrawal_payable',null,null,v_request_id,'withdrawal_payable',v_net,'withdrawal:'||v_request_id::text||':payable');
  insert into public.finance_audit_log(actor_user_id,event_type,entity_type,entity_id,details)
  values(p_user_id,'withdrawal_requested','withdrawal',v_request_id::text,jsonb_build_object('account_code',v_account_code,'gross',p_gross_amount,'fee',v_fee,'net',v_net,'destination',p_destination_address));
  return jsonb_build_object('ok',true,'withdrawal_id',v_request_id,'gross_amount',p_gross_amount,'fee_amount',v_fee,'net_amount',v_net,'fee_pct',v_settings.withdrawal_fee_pct);
end;
$$;

create or replace function public.finance_finalize_withdrawal(p_withdrawal_id uuid,p_action text,p_tx_hash text default null,p_reason text default null,p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request public.finance_withdrawal_requests%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  select * into v_request from public.finance_withdrawal_requests where id=p_withdrawal_id for update;
  if not found then raise exception 'withdrawal_not_found'; end if;
  if v_request.status in('paid','rejected') then raise exception 'withdrawal_already_finalized'; end if;
  if p_action='paid' then
    if p_tx_hash is null or length(trim(p_tx_hash))<>64 then raise exception 'valid_transaction_hash_required'; end if;
    update public.finance_withdrawal_requests set status='paid',tx_hash=lower(trim(p_tx_hash)),processed_at=now(),processed_by=p_admin_id where id=p_withdrawal_id;
    insert into public.finance_ledger_entries(account_code,withdrawal_id,entry_type,amount,idempotency_key,metadata)
    values
      ('company:withdrawal_payable',p_withdrawal_id,'withdrawal_paid',-v_request.net_amount,'withdrawal:'||p_withdrawal_id::text||':paid',jsonb_build_object('tx_hash',lower(trim(p_tx_hash)))),
      ('company:treasury_outflow',p_withdrawal_id,'treasury_outflow',-v_request.net_amount,'withdrawal:'||p_withdrawal_id::text||':treasury_outflow','{}'::jsonb),
      ('company:operations_pending',p_withdrawal_id,'withdrawal_fee_collected',-v_request.fee_amount,'withdrawal:'||p_withdrawal_id::text||':fee_collected','{}'::jsonb),
      ('company:operations',p_withdrawal_id,'operating_contribution',v_request.fee_amount,'withdrawal:'||p_withdrawal_id::text||':operations','{}'::jsonb);
  elsif p_action='rejected' then
    update public.finance_withdrawal_requests set status='rejected',rejection_reason=coalesce(p_reason,'Rejected by finance administrator'),processed_at=now(),processed_by=p_admin_id where id=p_withdrawal_id;
    insert into public.finance_ledger_entries(account_code,user_id,owner_slot,withdrawal_id,entry_type,amount,idempotency_key,metadata)
    values
      (v_request.account_code,v_request.user_id,v_request.owner_slot,p_withdrawal_id,'withdrawal_refund',v_request.gross_amount,'withdrawal:'||p_withdrawal_id::text||':refund','{}'::jsonb),
      ('company:operations_pending',null,null,p_withdrawal_id,'withdrawal_fee_reversal',-v_request.fee_amount,'withdrawal:'||p_withdrawal_id::text||':fee_reversal','{}'::jsonb),
      ('company:withdrawal_payable',null,null,p_withdrawal_id,'withdrawal_payable_reversal',-v_request.net_amount,'withdrawal:'||p_withdrawal_id::text||':payable_reversal','{}'::jsonb);
  else raise exception 'invalid_withdrawal_action'; end if;
  insert into public.finance_audit_log(actor_user_id,event_type,entity_type,entity_id,details)
  values(p_admin_id,'withdrawal_'||p_action,'withdrawal',p_withdrawal_id::text,jsonb_build_object('tx_hash',p_tx_hash,'reason',p_reason));
  return jsonb_build_object('ok',true,'withdrawal_id',p_withdrawal_id,'status',p_action);
end;
$$;

create or replace function public.finance_get_balance(p_account_code text)
returns numeric(18,6) language sql stable security definer set search_path='' as $$
  select coalesce(sum(amount),0)::numeric(18,6) from public.finance_ledger_entries where account_code=p_account_code;
$$;
create or replace function public.finance_get_all_balances()
returns table(account_code text,balance numeric(18,6)) language sql stable security definer set search_path='' as $$
  select le.account_code,coalesce(sum(le.amount),0)::numeric(18,6) from public.finance_ledger_entries le group by le.account_code;
$$;

revoke all on function public.finance_settle_membership(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.finance_create_withdrawal(uuid,smallint,numeric,text) from public,anon,authenticated;
revoke all on function public.finance_finalize_withdrawal(uuid,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.finance_get_balance(text) from public,anon,authenticated;
revoke all on function public.finance_get_all_balances() from public,anon,authenticated;
grant execute on function public.finance_settle_membership(uuid,text,jsonb) to service_role;
grant execute on function public.finance_create_withdrawal(uuid,smallint,numeric,text) to service_role;
grant execute on function public.finance_finalize_withdrawal(uuid,text,text,text,uuid) to service_role;
grant execute on function public.finance_get_balance(text) to service_role;
grant execute on function public.finance_get_all_balances() to service_role;
