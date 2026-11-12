create table if not exists public.academy_ai_lessons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null,
  level text not null default 'Beginner',
  duration_minutes integer not null default 5 check (duration_minutes between 1 and 90),
  content jsonb not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  model text not null default 'gpt-4.1-mini',
  generated_by uuid references auth.users(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists academy_ai_lessons_published_idx on public.academy_ai_lessons(status, category, created_at desc);
alter table public.academy_ai_lessons enable row level security;
grant select on public.academy_ai_lessons to authenticated;
drop policy if exists "members read published AI academy lessons" on public.academy_ai_lessons;
create policy "members read published AI academy lessons" on public.academy_ai_lessons for select to authenticated
using (status = 'published' and exists (select 1 from public.member_access m where m.user_id = (select auth.uid())));
drop policy if exists "admins read all AI academy lessons" on public.academy_ai_lessons;
create policy "admins read all AI academy lessons" on public.academy_ai_lessons for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

create table if not exists public.academy_ai_discussions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid references public.academy_ai_lessons(id) on delete set null,
  question text not null check (char_length(question) between 2 and 1600),
  ai_response text not null check (char_length(ai_response) between 2 and 8000),
  model text not null default 'gpt-4.1-mini',
  created_at timestamptz not null default now()
);
create index if not exists academy_ai_discussions_user_idx on public.academy_ai_discussions(user_id, created_at desc);
alter table public.academy_ai_discussions enable row level security;
grant select on public.academy_ai_discussions to authenticated;
drop policy if exists "members read own AI academy discussions" on public.academy_ai_discussions;
create policy "members read own AI academy discussions" on public.academy_ai_discussions for select to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.member_access m where m.user_id = (select auth.uid())));
drop policy if exists "admins read AI academy discussions" on public.academy_ai_discussions;
create policy "admins read AI academy discussions" on public.academy_ai_discussions for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

comment on table public.academy_ai_lessons is 'AI-authored Academy lessons. Only server-side service role writes generated content; members can read published lessons.';
comment on table public.academy_ai_discussions is 'Private member-to-AI Academy tutoring threads. AI answers are generated server-side; no public member-authored discussion feed.';
