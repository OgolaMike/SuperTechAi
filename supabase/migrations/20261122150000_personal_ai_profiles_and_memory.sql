-- Phase 1-2: member-owned AI profile and opt-in private conversation memory.
create table if not exists public.member_ai_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  goal text not null default 'Build consistent trading habits and protect my capital' check (char_length(goal) <= 240),
  memory_opt_in boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.member_ai_profiles enable row level security;
grant select, insert, update, delete on public.member_ai_profiles to authenticated;
drop policy if exists "members manage own AI profile" on public.member_ai_profiles;
create policy "members manage own AI profile" on public.member_ai_profiles for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.member_ai_chat_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists member_ai_chat_history_user_idx on public.member_ai_chat_history(user_id, created_at desc);
alter table public.member_ai_chat_history enable row level security;
grant select, insert, delete on public.member_ai_chat_history to authenticated;
drop policy if exists "members manage own AI chat history" on public.member_ai_chat_history;
create policy "members manage own AI chat history" on public.member_ai_chat_history for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

comment on table public.member_ai_profiles is 'Private member AI goals and explicit opt-in to cross-device profile/chat memory.';
comment on table public.member_ai_chat_history is 'Private, opt-in personal AI companion conversation memory, owned by each authenticated member.';
