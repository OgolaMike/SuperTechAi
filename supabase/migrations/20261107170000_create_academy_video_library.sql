create table if not exists public.academy_videos (
  id uuid primary key default gen_random_uuid(),
  lesson_id text not null,
  lesson_title text not null,
  provider_session_id text not null unique,
  provider_video_id text,
  status text not null default 'pending'
    check (status in ('pending','processing','completed','failed')),
  video_url text,
  thumbnail_url text,
  failure_reason text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.academy_videos enable row level security;
grant select on public.academy_videos to authenticated;
grant all on public.academy_videos to service_role;

drop policy if exists "authenticated members can view academy videos" on public.academy_videos;
create policy "authenticated members can view academy videos"
  on public.academy_videos for select to authenticated
  using (status = 'completed');

drop policy if exists "service role manages academy videos" on public.academy_videos;
create policy "service role manages academy videos"
  on public.academy_videos for all to service_role
  using (true) with check (true);

create index if not exists academy_videos_lesson_created_idx
  on public.academy_videos (lesson_id, created_at desc);
