-- Membership tiers: existing paid members remain Standard; Premium is activated
-- only by a verified 500 USDT payment. Automation entitlement is fail-closed.
alter table public.member_access
  add column if not exists membership_tier text not null default 'standard'
  check (membership_tier in ('standard','premium'));

alter table public.finance_payment_orders
  drop constraint if exists finance_payment_orders_amount_check;
alter table public.finance_payment_orders
  add constraint finance_payment_orders_amount_check
  check (amount in (300, 500));

alter table public.finance_payment_orders
  add column if not exists membership_tier text
  generated always as (case when amount = 500 then 'premium' else 'standard' end) stored;

create or replace function private.sync_membership_tier_from_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    insert into public.member_access(user_id, approved_at, membership_tier)
    values (new.user_id, coalesce(new.confirmed_at, now()), case when new.amount = 500 then 'premium' else 'standard' end)
    on conflict (user_id) do update
      set membership_tier = case
        when excluded.membership_tier = 'premium' then 'premium'
        else public.member_access.membership_tier
      end;
    insert into public.finance_audit_log(actor_user_id,event_type,entity_type,entity_id,details)
    values (null,'membership_tier_activated','member',new.user_id::text,
      jsonb_build_object('tier',case when new.amount = 500 then 'premium' else 'standard' end,
                         'payment_order_id',new.id,'amount',new.amount));
  end if;
  return new;
end;
$$;

drop trigger if exists finance_sync_membership_tier on public.finance_payment_orders;
create trigger finance_sync_membership_tier
after insert or update of status on public.finance_payment_orders
for each row execute function private.sync_membership_tier_from_payment();

-- Existing approved members are explicitly Standard unless a confirmed 500 USDT
-- payment exists for that account. No existing member is removed or downgraded.
update public.member_access ma
set membership_tier = case when exists (
  select 1 from public.finance_payment_orders po
  where po.user_id = ma.user_id and po.status = 'confirmed' and po.amount = 500
) then 'premium' else 'standard' end;

create or replace function public.has_premium_automation_access(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.member_access ma
    where ma.user_id = p_user_id and ma.membership_tier = 'premium'
  ) or exists (
    select 1 from public.admin_users au where au.user_id = p_user_id
  );
$$;
revoke all on function public.has_premium_automation_access(uuid) from public, anon;
grant execute on function public.has_premium_automation_access(uuid) to authenticated, service_role;
