create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  campaign_type text not null default 'product',
  headline text not null,
  details text not null default '',
  event_date date,
  event_time time,
  venue text,
  call_to_action text not null default '',
  caption text not null default '',
  creative_url text,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

alter table public.marketing_campaigns enable row level security;

drop policy if exists "Admins can read marketing campaigns" on public.marketing_campaigns;
create policy "Admins can read marketing campaigns"
on public.marketing_campaigns for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

drop policy if exists "Admins can create marketing campaigns" on public.marketing_campaigns;
create policy "Admins can create marketing campaigns"
on public.marketing_campaigns for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
);

drop policy if exists "Admins can delete marketing campaigns" on public.marketing_campaigns;
create policy "Admins can delete marketing campaigns"
on public.marketing_campaigns for delete to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

grant select, insert, delete on public.marketing_campaigns to authenticated;
