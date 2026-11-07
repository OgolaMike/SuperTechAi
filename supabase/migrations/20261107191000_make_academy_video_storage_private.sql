update storage.buckets set public = false where id = 'academy-videos';

drop policy if exists "academy videos are publicly readable" on storage.objects;
drop policy if exists "authenticated members can read academy videos" on storage.objects;
create policy "authenticated members can read academy videos"
  on storage.objects for select to authenticated
  using (bucket_id = 'academy-videos');
