-- Private, consent-gated Personal AI conversation history.
create table if not exists public.member_ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists member_ai_chat_messages_user_created_idx
  on public.member_ai_chat_messages (user_id, created_at desc);
alter table public.member_ai_chat_messages enable row level security;
drop policy if exists member_ai_chat_select_own on public.member_ai_chat_messages;
create policy member_ai_chat_select_own on public.member_ai_chat_messages
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists member_ai_chat_insert_own on public.member_ai_chat_messages;
create policy member_ai_chat_insert_own on public.member_ai_chat_messages
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists member_ai_chat_delete_own on public.member_ai_chat_messages;
create policy member_ai_chat_delete_own on public.member_ai_chat_messages
  for delete to authenticated using ((select auth.uid()) = user_id);
