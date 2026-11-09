-- Owner governance centre. Existing admin_users are the five founding owners.
create table if not exists public.governance_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'owner' check (role in ('owner','secretary')),
  active boolean not null default true,
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.governance_proposals (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 5 and 180),
  description text not null check (char_length(trim(description)) between 10 and 12000),
  category text not null default 'general',
  status text not null default 'open' check (status in ('draft','open','closed','approved','rejected','withdrawn')),
  created_by uuid not null references auth.users(id),
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.governance_votes (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.governance_proposals(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  choice text not null check (choice in ('yes','no','abstain')),
  rationale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proposal_id, voter_id)
);
create table if not exists public.governance_discussions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references public.governance_proposals(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.governance_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 180),
  body text not null check (char_length(trim(body)) between 1 and 12000),
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now(),
  archived_at timestamptz
);
create table if not exists public.governance_announcement_reads (
  announcement_id uuid not null references public.governance_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
create table if not exists public.governance_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists governance_proposals_status_created_idx on public.governance_proposals(status, created_at desc);
create index if not exists governance_votes_proposal_idx on public.governance_votes(proposal_id);
create index if not exists governance_discussions_proposal_created_idx on public.governance_discussions(proposal_id, created_at);
create index if not exists governance_announcements_published_idx on public.governance_announcements(published_at desc);
create index if not exists governance_audit_created_idx on public.governance_audit_log(created_at desc);

create or replace function public.is_governance_owner()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.governance_owners where user_id = auth.uid() and active = true); $$;
create or replace function public.is_governance_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admin_users where user_id = auth.uid()); $$;

alter table public.governance_owners enable row level security;
alter table public.governance_proposals enable row level security;
alter table public.governance_votes enable row level security;
alter table public.governance_discussions enable row level security;
alter table public.governance_announcements enable row level security;
alter table public.governance_announcement_reads enable row level security;
alter table public.governance_audit_log enable row level security;

create policy "governance owners visible to governance" on public.governance_owners for select to authenticated using (public.is_governance_owner() or public.is_governance_admin());
create policy "admins manage governance owners" on public.governance_owners for all to authenticated using (public.is_governance_admin()) with check (public.is_governance_admin());
create policy "owners read proposals" on public.governance_proposals for select to authenticated using (public.is_governance_owner() or public.is_governance_admin());
create policy "owners create proposals" on public.governance_proposals for insert to authenticated with check ((public.is_governance_owner() or public.is_governance_admin()) and created_by = auth.uid());
create policy "owners update proposals" on public.governance_proposals for update to authenticated using ((public.is_governance_owner() or public.is_governance_admin()) and (created_by = auth.uid() or public.is_governance_admin())) with check (public.is_governance_owner() or public.is_governance_admin());
create policy "owners read votes" on public.governance_votes for select to authenticated using (public.is_governance_owner() or public.is_governance_admin());
create policy "owners cast own vote" on public.governance_votes for insert to authenticated with check ((public.is_governance_owner() or public.is_governance_admin()) and voter_id = auth.uid() and exists (select 1 from public.governance_proposals p where p.id = proposal_id and p.status = 'open' and (p.closes_at is null or p.closes_at > now())));
create policy "owners update own vote" on public.governance_votes for update to authenticated using (voter_id = auth.uid() and (public.is_governance_owner() or public.is_governance_admin())) with check (voter_id = auth.uid() and (public.is_governance_owner() or public.is_governance_admin()) and exists (select 1 from public.governance_proposals p where p.id = proposal_id and p.status = 'open' and (p.closes_at is null or p.closes_at > now())));
create policy "owners read discussions" on public.governance_discussions for select to authenticated using (public.is_governance_owner() or public.is_governance_admin());
create policy "owners add discussion" on public.governance_discussions for insert to authenticated with check ((public.is_governance_owner() or public.is_governance_admin()) and created_by = auth.uid());
create policy "governance read announcements" on public.governance_announcements for select to authenticated using (public.is_governance_owner() or public.is_governance_admin());
create policy "admins publish announcements" on public.governance_announcements for all to authenticated using (public.is_governance_admin()) with check (public.is_governance_admin() and published_by = auth.uid());
create policy "owners read announcement receipts" on public.governance_announcement_reads for select to authenticated using (public.is_governance_owner() or public.is_governance_admin());
create policy "owners acknowledge announcements" on public.governance_announcement_reads for insert to authenticated with check ((public.is_governance_owner() or public.is_governance_admin()) and user_id = auth.uid());
create policy "governance read audit log" on public.governance_audit_log for select to authenticated using (public.is_governance_owner() or public.is_governance_admin());

create or replace function public.governance_audit_trigger()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_id text;
begin
  if tg_op = 'DELETE' then
    v_id := coalesce(to_jsonb(old)->>'id', to_jsonb(old)->>'user_id', to_jsonb(old)->>'announcement_id');
    insert into public.governance_audit_log(actor_id,action,entity_type,entity_id,details) values (auth.uid(),'delete',tg_table_name,v_id,jsonb_build_object('before',to_jsonb(old)));
    return old;
  elsif tg_op = 'UPDATE' then
    v_id := coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'user_id', to_jsonb(new)->>'announcement_id');
    insert into public.governance_audit_log(actor_id,action,entity_type,entity_id,details) values (auth.uid(),'update',tg_table_name,v_id,jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(new)));
    return new;
  else
    v_id := coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'user_id', to_jsonb(new)->>'announcement_id');
    insert into public.governance_audit_log(actor_id,action,entity_type,entity_id,details) values (auth.uid(),'insert',tg_table_name,v_id,jsonb_build_object('after',to_jsonb(new)));
    return new;
  end if;
end;
$$;
create trigger governance_owners_audit after insert or update or delete on public.governance_owners for each row execute function public.governance_audit_trigger();
create trigger governance_proposals_audit after insert or update or delete on public.governance_proposals for each row execute function public.governance_audit_trigger();
create trigger governance_votes_audit after insert or update or delete on public.governance_votes for each row execute function public.governance_audit_trigger();
create trigger governance_discussions_audit after insert on public.governance_discussions for each row execute function public.governance_audit_trigger();
create trigger governance_announcements_audit after insert or update or delete on public.governance_announcements for each row execute function public.governance_audit_trigger();

insert into public.governance_owners(user_id,display_name,role,active)
select a.user_id, coalesce(u.email,'Owner'), 'owner', true from public.admin_users a join auth.users u on u.id=a.user_id
on conflict(user_id) do nothing;
