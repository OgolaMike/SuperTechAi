-- Admin-only directory data. The RPC is callable only by the service-role Edge Function,
-- which independently verifies the requesting user's admin_users record.
create or replace function public.finance_get_all_network_members()
returns table (
  user_id uuid,
  sponsor_user_id uuid,
  sponsor_account_code text,
  referral_code text,
  created_at timestamptz,
  display_name text,
  membership_active boolean,
  approved_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.user_id,
    p.sponsor_user_id,
    p.sponsor_account_code,
    p.referral_code,
    p.created_at,
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'Member ' || left(p.user_id::text, 6)
    ) as display_name,
    (ma.user_id is not null) as membership_active,
    ma.approved_at
  from public.finance_member_profiles p
  join auth.users u on u.id = p.user_id
  left join public.member_access ma on ma.user_id = p.user_id
  order by p.created_at, p.user_id;
$$;

revoke all on function public.finance_get_all_network_members() from public, anon, authenticated;
grant execute on function public.finance_get_all_network_members() to service_role;
