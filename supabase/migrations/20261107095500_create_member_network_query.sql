-- Return only the signed-in member's descendant network.
-- The Edge Function calls this with service_role after validating the member JWT.
create or replace function public.finance_get_network(p_root_user_id uuid)
returns table (
  user_id uuid,
  sponsor_user_id uuid,
  depth integer,
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
  with recursive network as (
    select
      p.user_id,
      p.sponsor_user_id,
      1 as depth,
      p.referral_code,
      p.created_at,
      array[p_root_user_id, p.user_id]::uuid[] as path
    from public.finance_member_profiles p
    where p.sponsor_user_id = p_root_user_id

    union all

    select
      child.user_id,
      child.sponsor_user_id,
      parent.depth + 1,
      child.referral_code,
      child.created_at,
      parent.path || child.user_id
    from public.finance_member_profiles child
    join network parent on child.sponsor_user_id = parent.user_id
    where parent.depth < 50
      and not child.user_id = any(parent.path)
  )
  select
    n.user_id,
    n.sponsor_user_id,
    n.depth,
    n.referral_code,
    n.created_at,
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'Member ' || left(n.user_id::text, 6)
    ) as display_name,
    (ma.user_id is not null) as membership_active,
    ma.approved_at
  from network n
  join auth.users u on u.id = n.user_id
  left join public.member_access ma on ma.user_id = n.user_id
  order by n.depth, n.created_at, n.user_id;
$$;

revoke all on function public.finance_get_network(uuid) from public, anon, authenticated;
grant execute on function public.finance_get_network(uuid) to service_role;
