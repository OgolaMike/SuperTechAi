drop policy if exists "authenticated members can view academy videos" on public.academy_videos;
create policy "authenticated members can view academy videos"
  on public.academy_videos for select to authenticated
  using (
    status = 'completed'
    or exists (
      select 1 from public.admin_users au
      where au.user_id = (select auth.uid())
    )
  );
