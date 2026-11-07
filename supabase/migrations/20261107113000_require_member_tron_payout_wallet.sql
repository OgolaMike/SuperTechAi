alter table public.finance_member_profiles
  add column if not exists payout_tron_address text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'finance_member_payout_tron_address_format'
      and conrelid = 'public.finance_member_profiles'::regclass
  ) then
    alter table public.finance_member_profiles
      add constraint finance_member_payout_tron_address_format
      check (payout_tron_address is null or payout_tron_address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$');
  end if;
end
$$;

create or replace function private.create_finance_member_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_wallet text;
begin
  v_wallet := nullif(btrim(new.raw_user_meta_data ->> 'payout_tron_address'), '');
  if v_wallet is null or v_wallet !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$' then
    raise exception 'A valid USDT TRC20 payout wallet is required during registration';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.finance_member_profiles(user_id, referral_code, payout_tron_address)
  values(new.id, v_code, v_wallet)
  on conflict(user_id) do update
    set payout_tron_address = coalesce(public.finance_member_profiles.payout_tron_address, excluded.payout_tron_address);
  return new;
end;
$$;

revoke all on function private.create_finance_member_profile() from public, anon, authenticated;
