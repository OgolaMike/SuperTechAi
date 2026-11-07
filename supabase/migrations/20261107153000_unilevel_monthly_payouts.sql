-- Separate Unilevel earnings from the general member wallet and prepare
-- idempotent monthly TRC20 payout jobs. No private key is stored in Postgres.
create table if not exists public.unilevel_auto_payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  payout_month date not null,
  gross_amount numeric(18,6) not null check (gross_amount > 0),
  fee_amount numeric(18,6) not null check (fee_amount >= 0),
  net_amount numeric(18,6) not null check (net_amount > 0),
  destination_address text not null check (destination_address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'),
  status text not null default 'queued' check (status in ('queued','processing','paid','failed','broadcast_unknown')),
  tx_hash text,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  unique(user_id,payout_month),
  unique(tx_hash)
);
alter table public.unilevel_auto_payouts enable row level security;
revoke all on public.unilevel_auto_payouts from anon, authenticated;
grant select on public.unilevel_auto_payouts to service_role;

create index if not exists unilevel_auto_payouts_status_created_idx
  on public.unilevel_auto_payouts(status,created_at);

create or replace function public.finance_create_unilevel_withdrawal(
  p_user_id uuid, p_gross_amount numeric, p_destination_address text
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_settings public.finance_settings%rowtype;
  v_account_code text := 'unilevel:'||p_user_id::text;
  v_balance numeric(18,6);
  v_fee numeric(18,6);
  v_net numeric(18,6);
  v_request_id uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  if p_user_id is null or p_gross_amount is null or p_gross_amount <= 0 then
    raise exception 'invalid_withdrawal_amount';
  end if;
  if p_destination_address !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$' then
    raise exception 'invalid_tron_address';
  end if;
  perform pg_advisory_xact_lock(hashtext('unilevel_withdrawal'),hashtext(p_user_id::text));
  select * into v_settings from public.finance_settings where id=1;
  select coalesce(sum(amount),0) into v_balance
    from public.finance_ledger_entries where account_code=v_account_code;
  if p_gross_amount > v_balance then raise exception 'insufficient_unilevel_balance'; end if;
  v_fee:=round(p_gross_amount*(v_settings.withdrawal_fee_pct/100),6);
  v_net:=round(p_gross_amount-v_fee,6);
  if v_net<=0 then raise exception 'net_withdrawal_too_small'; end if;
  insert into public.finance_withdrawal_requests(user_id,account_code,gross_amount,fee_amount,net_amount,destination_address)
    values(p_user_id,v_account_code,p_gross_amount,v_fee,v_net,p_destination_address)
    returning id into v_request_id;
  insert into public.finance_ledger_entries(account_code,user_id,withdrawal_id,entry_type,amount,idempotency_key)
  values
    (v_account_code,p_user_id,v_request_id,'withdrawal_debit',-p_gross_amount,'withdrawal:'||v_request_id::text||':debit'),
    ('company:operations_pending',null,v_request_id,'withdrawal_fee_pending',v_fee,'withdrawal:'||v_request_id::text||':fee_pending'),
    ('company:withdrawal_payable',null,v_request_id,'withdrawal_payable',v_net,'withdrawal:'||v_request_id::text||':payable');
  insert into public.finance_audit_log(actor_user_id,event_type,entity_type,entity_id,details)
  values(p_user_id,'unilevel_withdrawal_requested','withdrawal',v_request_id::text,
    jsonb_build_object('account_code',v_account_code,'gross',p_gross_amount,'fee',v_fee,'net',v_net,'destination',p_destination_address));
  return jsonb_build_object('ok',true,'withdrawal_id',v_request_id,'gross_amount',p_gross_amount,
    'fee_amount',v_fee,'net_amount',v_net,'fee_pct',v_settings.withdrawal_fee_pct);
end;
$function$;
revoke all on function public.finance_create_unilevel_withdrawal(uuid,numeric,text) from public, anon, authenticated;
grant execute on function public.finance_create_unilevel_withdrawal(uuid,numeric,text) to service_role;

create or replace function public.finance_queue_monthly_unilevel_payouts()
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_month date := date_trunc('month', (now() at time zone 'Africa/Nairobi'))::date;
  v_settings public.finance_settings%rowtype;
  v_member record;
  v_gross numeric(18,6);
  v_fee numeric(18,6);
  v_net numeric(18,6);
  v_count integer := 0;
  v_skipped integer := 0;
  v_id uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
     and session_user not in ('postgres','supabase_admin') then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  if extract(day from v_today) <> 1 then
    return jsonb_build_object('ok',true,'not_payout_day',true,'nairobi_date',v_today);
  end if;
  perform pg_advisory_xact_lock(hashtext('unilevel_monthly_payout'),hashtext(v_month::text));
  select * into v_settings from public.finance_settings where id=1;
  for v_member in
    select ma.user_id, mp.payout_tron_address
    from public.member_access ma
    join public.finance_member_profiles mp on mp.user_id=ma.user_id
    order by ma.user_id
  loop
    if v_member.payout_tron_address is null
       or v_member.payout_tron_address !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$' then
      v_skipped:=v_skipped+1;
      continue;
    end if;
    select round(coalesce(sum(amount),0),6) into v_gross
      from public.finance_ledger_entries
      where account_code='unilevel:'||v_member.user_id::text;
    if v_gross<=0 then continue; end if;
    v_fee:=round(v_gross*(v_settings.withdrawal_fee_pct/100),6);
    v_net:=round(v_gross-v_fee,6);
    if v_net<=0 then continue; end if;
    insert into public.unilevel_auto_payouts(user_id,payout_month,gross_amount,fee_amount,net_amount,destination_address)
      values(v_member.user_id,v_month,v_gross,v_fee,v_net,v_member.payout_tron_address)
      on conflict(user_id,payout_month) do nothing
      returning id into v_id;
    if v_id is null then continue; end if;
    insert into public.finance_ledger_entries(account_code,user_id,entry_type,amount,idempotency_key,metadata)
    values
      ('unilevel:'||v_member.user_id::text,v_member.user_id,'unilevel_monthly_payout_debit',-v_gross,
       'unilevel-month:'||v_month::text||':'||v_member.user_id::text||':debit',jsonb_build_object('payout_id',v_id)),
      ('company:operations_pending',null,'unilevel_monthly_fee_pending',v_fee,
       'unilevel-month:'||v_month::text||':'||v_member.user_id::text||':fee',jsonb_build_object('payout_id',v_id)),
      ('company:withdrawal_payable',null,'unilevel_monthly_payable',v_net,
       'unilevel-month:'||v_month::text||':'||v_member.user_id::text||':payable',jsonb_build_object('payout_id',v_id));
    v_count:=v_count+1;
    v_id:=null;
  end loop;
  insert into public.finance_audit_log(actor_user_id,event_type,entity_type,entity_id,details)
  values(null,'unilevel_monthly_payouts_queued','unilevel_payout_batch',v_month::text,
    jsonb_build_object('queued',v_count,'skipped_missing_wallet',v_skipped,'payout_month',v_month));
  return jsonb_build_object('ok',true,'payout_month',v_month,'queued',v_count,'skipped_missing_wallet',v_skipped);
end;
$function$;
revoke all on function public.finance_queue_monthly_unilevel_payouts() from public, anon, authenticated;
grant execute on function public.finance_queue_monthly_unilevel_payouts() to service_role;

-- Run shortly after midnight Nairobi time. The database function itself checks
-- the local calendar day, so this daily schedule only queues on the 1st.
do $schedule$
declare v_job_id bigint;
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    select jobid into v_job_id from cron.job where jobname='unilevel-monthly-payout-queue' limit 1;
    if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
    perform cron.schedule('unilevel-monthly-payout-queue','5 21 * * *',
      'select public.finance_queue_monthly_unilevel_payouts();');
  end if;
end;
$schedule$;

-- Credit each of the five upline positions 2% of the confirmed membership sale.
-- A vacant level remains in the Unilevel pool; it is not reassigned to another member.
create or replace function public.finance_settle_membership(
  p_order_id uuid, p_tx_hash text, p_chain_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_order public.finance_payment_orders%rowtype;
  v_settings public.finance_settings%rowtype;
  v_direct_count integer := 0;
  v_sponsor uuid;
  v_sponsor_account_code text;
  v_owner_amount numeric(18,6);
  v_direct_amount numeric(18,6);
  v_infinity_amount numeric(18,6);
  v_unilevel_amount numeric(18,6);
  v_level_amount numeric(18,6);
  v_lucky_amount numeric(18,6);
  v_slot smallint;
  v_level integer;
  v_level_sponsor uuid;
  v_next_sponsor uuid;
  v_account_code text;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  select * into v_order from public.finance_payment_orders where id=p_order_id for update;
  if not found then raise exception 'payment_order_not_found'; end if;
  if v_order.status='confirmed' then
    return jsonb_build_object('ok',true,'already_confirmed',true,'order_id',v_order.id);
  end if;
  if v_order.status<>'pending' then raise exception 'payment_order_not_pending'; end if;
  if v_order.expires_at<now() then
    update public.finance_payment_orders set status='expired' where id=v_order.id;
    raise exception 'payment_order_expired';
  end if;
  if p_tx_hash is null or length(trim(p_tx_hash))<>64 then raise exception 'invalid_transaction_hash'; end if;
  if exists(select 1 from public.finance_payment_orders where tx_hash=lower(trim(p_tx_hash)) and id<>p_order_id) then
    raise exception 'transaction_already_used';
  end if;
  select * into v_settings from public.finance_settings where id=1;
  if v_settings.id is null then raise exception 'finance_settings_missing'; end if;
  v_sponsor:=v_order.sponsor_user_id;
  v_sponsor_account_code:=v_order.sponsor_account_code;
  if v_sponsor is not null then
    select count(distinct p.user_id)::integer into v_direct_count
    from public.finance_payment_orders p
    where p.sponsor_user_id=v_sponsor and p.status='confirmed' and p.id<>p_order_id;
  elsif v_sponsor_account_code='company:account' then
    select count(distinct p.user_id)::integer into v_direct_count
    from public.finance_payment_orders p
    where p.sponsor_account_code='company:account' and p.status='confirmed' and p.id<>p_order_id;
  else raise exception 'referral_required';
  end if;
  v_owner_amount:=round(v_order.amount*(v_settings.owner_share_pct/100)/5,6);
  v_direct_amount:=round(v_order.amount*(v_settings.direct_pct/100),6);
  v_infinity_amount:=round(v_order.amount*(v_settings.infinity_pct/100),6);
  v_unilevel_amount:=round(v_order.amount*(v_settings.unilevel_pct/100),6);
  v_level_amount:=round(v_order.amount*0.02,6);
  v_lucky_amount:=round(v_order.amount*(v_settings.lucky_pct/100),6);
  update public.finance_payment_orders
  set status='confirmed',tx_hash=lower(trim(p_tx_hash)),
      chain_payload=coalesce(p_chain_payload,'{}'::jsonb),confirmed_at=now()
  where id=p_order_id;
  insert into public.finance_ledger_entries(account_code,payment_order_id,entry_type,amount,idempotency_key,metadata)
  values
    ('company:membership_revenue',v_order.id,'membership_revenue',v_order.amount,'payment:'||v_order.id::text||':revenue','{"kind":"gross_revenue"}'::jsonb),
    ('company:treasury_inflow',v_order.id,'treasury_inflow',v_order.amount,'payment:'||v_order.id::text||':treasury_inflow','{"network":"TRC20"}'::jsonb);
  for v_slot in 1..5 loop
    insert into public.finance_ledger_entries(account_code,owner_slot,payment_order_id,entry_type,amount,idempotency_key,metadata)
    values('owner:'||v_slot::text,v_slot,v_order.id,'owner_share',v_owner_amount,
      'payment:'||v_order.id::text||':owner:'||v_slot::text,
      jsonb_build_object('share_pct',v_settings.owner_share_pct/5));
  end loop;
  if v_sponsor is not null then
    insert into public.finance_ledger_entries(account_code,user_id,payment_order_id,entry_type,amount,idempotency_key,metadata)
    values('member:'||v_sponsor::text,v_sponsor,v_order.id,'direct_commission',v_direct_amount,
      'payment:'||v_order.id::text||':direct',
      jsonb_build_object('rate_pct',v_settings.direct_pct,'direct_referrals_before_sale',v_direct_count));
  else
    insert into public.finance_ledger_entries(account_code,payment_order_id,entry_type,amount,idempotency_key,metadata)
    values('company:account',v_order.id,'company_direct_commission',v_direct_amount,
      'payment:'||v_order.id::text||':direct',
      jsonb_build_object('rate_pct',v_settings.direct_pct,'direct_referrals_before_sale',v_direct_count,'sponsor_type','company'));
  end if;
  if v_infinity_amount>0 then
    insert into public.finance_ledger_entries(account_code,payment_order_id,entry_type,amount,idempotency_key,metadata)
    values('pool:infinity',v_order.id,'infinity_pool',v_infinity_amount,
      'payment:'||v_order.id::text||':infinity',jsonb_build_object('rate_pct',v_settings.infinity_pct));
  end if;
  v_level_sponsor:=v_sponsor;
  for v_level in 1..5 loop
    if v_level_sponsor is not null then
      v_account_code:='unilevel:'||v_level_sponsor::text;
      insert into public.finance_ledger_entries(account_code,user_id,payment_order_id,entry_type,amount,idempotency_key,metadata)
      values(v_account_code,v_level_sponsor,v_order.id,'unilevel_commission',v_level_amount,
        'payment:'||v_order.id::text||':unilevel:level:'||v_level::text,
        jsonb_build_object('level',v_level,'rate_pct',2));
      select sponsor_user_id into v_next_sponsor
      from public.finance_member_profiles where user_id=v_level_sponsor;
      v_level_sponsor:=v_next_sponsor;
    else
      insert into public.finance_ledger_entries(account_code,payment_order_id,entry_type,amount,idempotency_key,metadata)
      values('pool:unilevel',v_order.id,'unilevel_unassigned_level',v_level_amount,
        'payment:'||v_order.id::text||':unilevel:level:'||v_level::text,
        jsonb_build_object('level',v_level,'rate_pct',2,'reason','no_upline_position'));
    end if;
  end loop;
  if v_lucky_amount>0 then
    insert into public.finance_ledger_entries(account_code,payment_order_id,entry_type,amount,idempotency_key,metadata)
    values('pool:lucky',v_order.id,'lucky_pool',v_lucky_amount,
      'payment:'||v_order.id::text||':lucky',jsonb_build_object('rate_pct',v_settings.lucky_pct));
  end if;
  insert into public.member_access(user_id,approved_at) values(v_order.user_id,now())
  on conflict(user_id) do update set approved_at=excluded.approved_at;
  insert into public.finance_audit_log(actor_user_id,event_type,entity_type,entity_id,details)
  values(null,'membership_payment_confirmed','payment_order',v_order.id::text,
    jsonb_build_object('user_id',v_order.user_id,'tx_hash',lower(trim(p_tx_hash)),'amount',v_order.amount,
      'sponsor_account_code',v_sponsor_account_code,'sponsor_user_id',v_sponsor,
      'unilevel_per_level',v_level_amount,'unilevel_pool_total',v_unilevel_amount));
  return jsonb_build_object('ok',true,'order_id',v_order.id,'user_id',v_order.user_id,
    'direct_amount',v_direct_amount,'infinity_amount',v_infinity_amount,
    'owner_share_each',v_owner_amount,'unilevel_per_level',v_level_amount,
    'activated',true,
    'sponsor_account_code',coalesce(v_sponsor_account_code,case when v_sponsor is not null then 'member:'||v_sponsor::text end));
end;
$function$;
revoke all on function public.finance_settle_membership(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.finance_settle_membership(uuid,text,jsonb) to service_role;
