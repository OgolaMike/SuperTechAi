create table if not exists public.academy_ai_discussion_topics (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 category text not null,
 discussion_prompt text not null,
 context text not null,
 talking_points jsonb not null default '[]'::jsonb,
 follow_up_questions jsonb not null default '[]'::jsonb,
 status text not null default 'draft' check (status in ('draft','published','archived')),
 model text not null default 'gpt-4.1-mini',
 generated_by uuid references auth.users(id),
 published_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists academy_ai_discussion_topics_published_idx on public.academy_ai_discussion_topics(status, created_at desc);
alter table public.academy_ai_discussion_topics enable row level security;
grant select on public.academy_ai_discussion_topics to authenticated;
drop policy if exists "members read published AI discussions" on public.academy_ai_discussion_topics;
create policy "members read published AI discussions" on public.academy_ai_discussion_topics for select to authenticated
using (status = 'published' and exists (select 1 from public.member_access m where m.user_id = (select auth.uid())));
drop policy if exists "admins read all AI discussions" on public.academy_ai_discussion_topics;
create policy "admins read all AI discussions" on public.academy_ai_discussion_topics for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
comment on table public.academy_ai_discussion_topics is 'AI-generated Academy discussion prompts and teaching context. Only trusted server-side generation publishes topics.';
