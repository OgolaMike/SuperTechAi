-- Marketing campaign drafts. Only authenticated SuperTech AI admins may read or change campaign content.
create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  campaign_type text not null check (campaign_type in ('product','event','offer','announcement','education','community','trade-review')),
  headline text not null check (char_length(headline) between 1 and 240),
  details text not null default '',
  event_date date,
  event_time time,
  venue text,
  call_to_action text not null default '',
  caption text not null,
  status text not null default 'draft' check (status in ('draft','ready','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.marketing_campaigns enable row level security;
grant select, insert, update, delete on public.marketing_campaigns to authenticated;
drop policy if exists "admins manage marketing campaigns" on public.marketing_campaigns;
create policy "admins manage marketing campaigns" on public.marketing_campaigns
for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
create index if not exists marketing_campaigns_created_at_idx on public.marketing_campaigns (created_at desc);
