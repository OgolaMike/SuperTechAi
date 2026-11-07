-- Just 4 You weekly bonus: reserve is the existing 5% lucky_pool allocation.
-- No additional deduction is made from Direct, Infinity, Unilevel or owner shares.
create table if not exists public.just4you_weekly_draws (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  week_end date not null,
  qualifying_sales numeric(18,6) not null check (qualifying_sales >= 0),
  prize_amount numeric(18,6) not null check (prize_amount >= 0),
  eligible_members integer not null check (eligible_members >= 0),
  winner_user_id uuid references auth.users(id) on delete set null,
  winner_display_name text,
  drawn_at timestamptz,
  payout_status text not null default 'pending'
    check (payout_status in ('pending','credited_to_earnings','no_winner')),
  created_at timestamptz not null default now(),
  constraint just4you_week_dates_valid check (week_end = week_start + 6)
);

alter table public.just4you_weekly_draws enable row level security;
drop policy if exists "Authenticated members can read Just 4 You results" on public.just4you_weekly_draws;
create policy "Authenticated members can read Just 4 You results"
  on public.just4you_weekly_draws for select to authenticated using (true);
revoke all on public.just4you_weekly_draws from anon;
grant select on public.just4you_weekly_draws to authenticated;

create or replace function public.just4you_get_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_week_start date;
  v_pool numeric(18,6);
  v_sales numeric(18,6);
  v_latest jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  v_week_start := date_trunc('week', v_today::timestamp)::date;
  select coalesce(sum(le.amount),0), coalesce(sum(po.amount),0)
    into v_pool, v_sales
  from public.finance_ledger_entries le
  join public.finance_payment_orders po on po.id = le.payment_order_id
  where le.entry_type = 'lucky_pool'
    and po.status = 'confirmed'
    and po.confirmed_at >= (v_week_start::timestamp at time zone 'Africa/Nairobi')
    and po.confirmed_at < ((v_week_start + 7)::timestamp at time zone 'Africa/Nairobi');

  select to_jsonb(d) into v_latest
  from public.just4you_weekly_draws d
  order by d.week_start desc limit 1;

  return jsonb_build_object(
    'week_start', v_week_start,
    'week_end', v_week_start + 6,
    'sales_pool', round(v_pool,6),
    'qualifying_sales', round(v_sales,6),
    'bonus_rate_pct', 5,
    'latest_draw', coalesce(v_latest,'null'::jsonb)
  );
end;
$$;
revoke all on function public.just4you_get_dashboard() from public, anon;
grant execute on function public.just4you_get_dashboard() to authenticated;

create or replace function public.just4you_run_weekly_draw()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_week_start date;
  v_week_end date;
  v_sales numeric(18,6);
  v_prize numeric(18,6);
  v_eligible integer;
  v_winner uuid;
  v_display_name text;
  v_existing public.just4you_weekly_draws%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role'
     and session_user not in ('postgres','supabase_admin') then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  -- The scheduled invocation is Monday 00:05 EAT; it draws for the prior
  -- complete Monday-Sunday period. The same period is idempotent.
  v_week_start := date_trunc('week', v_today::timestamp)::date - 7;
  v_week_end := v_week_start + 6;
  perform pg_advisory_xact_lock(hashtext('just4you_weekly_draw'), hashtext(v_week_start::text));

  select * into v_existing from public.just4you_weekly_draws where week_start=v_week_start;
  if found then
    return jsonb_build_object('ok',true,'already_drawn',true,'week_start',v_week_start);
  end if;

  select coalesce(sum(le.amount),0), coalesce(sum(po.amount),0)
    into v_prize, v_sales
  from public.finance_ledger_entries le
  join public.finance_payment_orders po on po.id=le.payment_order_id
  where le.entry_type='lucky_pool'
    and po.status='confirmed'
    and po.confirmed_at >= (v_week_start::timestamp at time zone 'Africa/Nairobi')
    and po.confirmed_at < ((v_week_end + 1)::timestamp at time zone 'Africa/Nairobi');

  -- The weekly bonus is exactly the already-funded 5% lucky pool.
  v_prize := round(v_prize,6);
  v_sales := round(v_sales,6);
  select count(*)::integer into v_eligible from public.member_access;
  if v_prize <= 0 or v_eligible = 0 then
    insert into public.just4you_weekly_draws
      (week_start,week_end,qualifying_sales,prize_amount,eligible_members,payout_status)
    values (v_week_start,v_week_end,v_sales,v_prize,v_eligible,'no_winner');
    return jsonb_build_object('ok',true,'winner_selected',false,'week_start',v_week_start,'prize_amount',v_prize);
  end if;

  -- Cryptographically secure random ordering; every active paid member has
  -- equal probability, regardless of personal sales or referral volume.
  select ma.user_id,
    coalesce(
      nullif(btrim(u.raw_user_meta_data->>'full_name'),''),
      nullif(btrim(u.raw_user_meta_data->>'name'),''),
      nullif(btrim(u.raw_user_meta_data->>'display_name'),''),
      nullif(split_part(coalesce(u.email,''),'@',1),''),
      'SuperTech AI Member'
    )
    into v_winner,v_display_name
  from public.member_access ma
  join auth.users u on u.id=ma.user_id
  order by extensions.gen_random_bytes(32)
  limit 1;

  insert into public.just4you_weekly_draws
    (week_start,week_end,qualifying_sales,prize_amount,eligible_members,winner_user_id,winner_display_name,drawn_at,payout_status)
  values (v_week_start,v_week_end,v_sales,v_prize,v_eligible,v_winner,v_display_name,now(),'credited_to_earnings');

  -- Move the funded amount out of the bonus pool and credit the single winner.
  -- The ledger keys make retries harmless and preserve a complete audit trail.
  insert into public.finance_ledger_entries(account_code,user_id,entry_type,amount,idempotency_key,metadata)
  values
    ('pool:lucky',null,'just4you_bonus_award',-v_prize,
      'just4you:'||v_week_start::text||':pool',
      jsonb_build_object('week_start',v_week_start,'winner_user_id',v_winner)),
    ('member:'||v_winner::text,v_winner,'just4you_weekly_bonus',v_prize,
      'just4you:'||v_week_start::text||':winner',
      jsonb_build_object('week_start',v_week_start,'week_end',v_week_end,'qualifying_sales',v_sales,'eligible_members',v_eligible));

  insert into public.finance_audit_log(actor_user_id,event_type,entity_type,entity_id,details)
  values (null,'just4you_weekly_winner_selected','just4you_weekly_draw',v_week_start::text,
    jsonb_build_object('winner_user_id',v_winner,'winner_display_name',v_display_name,
      'prize_amount',v_prize,'qualifying_sales',v_sales,'eligible_members',v_eligible));

  return jsonb_build_object('ok',true,'winner_selected',true,'week_start',v_week_start,
    'winner_display_name',v_display_name,'prize_amount',v_prize,'eligible_members',v_eligible);
end;
$$;
revoke all on function public.just4you_run_weekly_draw() from public, anon, authenticated;
grant execute on function public.just4you_run_weekly_draw() to service_role;

do $$
begin
  if exists(select 1 from cron.job where jobname='supertech-just4you-weekly-draw') then
    perform cron.unschedule('supertech-just4you-weekly-draw');
  end if;
  perform cron.schedule(
    'supertech-just4you-weekly-draw',
    '5 21 * * 0',
    $job$select public.just4you_run_weekly_draw();$job$
  );
end;
$$;
