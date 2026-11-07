alter table public.academy_videos
  alter column provider_session_id drop not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('academy-videos', 'academy-videos', true, 104857600, array['video/webm','video/mp4'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "academy videos are publicly readable" on storage.objects;
create policy "academy videos are publicly readable"
  on storage.objects for select to public using (bucket_id = 'academy-videos');

drop policy if exists "academy admins can upload videos" on storage.objects;
create policy "academy admins can upload videos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'academy-videos' and exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  ));

drop policy if exists "academy admins can update videos" on storage.objects;
create policy "academy admins can update videos"
  on storage.objects for update to authenticated
  using (bucket_id = 'academy-videos' and exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  ))
  with check (bucket_id = 'academy-videos' and exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  ));

drop policy if exists "academy admins can delete videos" on storage.objects;
create policy "academy admins can delete videos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'academy-videos' and exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  ));

drop policy if exists "academy admins can publish video records" on public.academy_videos;
create policy "academy admins can publish video records"
  on public.academy_videos for insert to authenticated
  with check (
    status = 'completed' and created_by = auth.uid() and video_url is not null
    and exists (select 1 from public.admin_users au where au.user_id = auth.uid())
  );

grant insert on public.academy_videos to authenticated;
