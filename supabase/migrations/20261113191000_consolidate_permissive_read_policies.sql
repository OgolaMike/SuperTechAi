-- Preserve existing row visibility and governance write permissions while
-- removing redundant permissive SELECT-policy evaluation.
drop policy if exists "admins read all AI discussions" on public.academy_ai_discussion_topics;
drop policy if exists "members read published AI discussions" on public.academy_ai_discussion_topics;
create policy "members and admins read AI discussion topics"
  on public.academy_ai_discussion_topics
  for select to authenticated
  using (
    exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
    or (
      status = 'published'
      and exists (select 1 from public.member_access m where m.user_id = (select auth.uid()))
    )
  );

drop policy if exists "admins read AI academy discussions" on public.academy_ai_discussions;
drop policy if exists "members read own AI academy discussions" on public.academy_ai_discussions;
create policy "members and admins read AI academy discussions"
  on public.academy_ai_discussions
  for select to authenticated
  using (
    exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
    or (
      user_id = (select auth.uid())
      and exists (select 1 from public.member_access m where m.user_id = (select auth.uid()))
    )
  );

drop policy if exists "admins read all AI academy lessons" on public.academy_ai_lessons;
drop policy if exists "members read published AI academy lessons" on public.academy_ai_lessons;
create policy "members and admins read AI academy lessons"
  on public.academy_ai_lessons
  for select to authenticated
  using (
    exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
    or (
      status = 'published'
      and exists (select 1 from public.member_access m where m.user_id = (select auth.uid()))
    )
  );

-- Split governance ALL policies into command-specific policies. This retains
-- admin-only writes and owner/admin reads without overlapping SELECT policies.
drop policy if exists "admins publish announcements" on public.governance_announcements;
drop policy if exists "governance read announcements" on public.governance_announcements;
create policy "governance members read announcements"
  on public.governance_announcements
  for select to authenticated
  using (public.is_governance_owner() or public.is_governance_admin());
create policy "admins insert announcements"
  on public.governance_announcements
  for insert to authenticated
  with check (public.is_governance_admin() and published_by = (select auth.uid()));
create policy "admins update announcements"
  on public.governance_announcements
  for update to authenticated
  using (public.is_governance_admin())
  with check (public.is_governance_admin() and published_by = (select auth.uid()));
create policy "admins delete announcements"
  on public.governance_announcements
  for delete to authenticated
  using (public.is_governance_admin());

drop policy if exists "admins manage governance owners" on public.governance_owners;
drop policy if exists "governance owners visible to governance" on public.governance_owners;
create policy "governance members read governance owners"
  on public.governance_owners
  for select to authenticated
  using (public.is_governance_owner() or public.is_governance_admin());
create policy "admins insert governance owners"
  on public.governance_owners
  for insert to authenticated
  with check (public.is_governance_admin());
create policy "admins update governance owners"
  on public.governance_owners
  for update to authenticated
  using (public.is_governance_admin())
  with check (public.is_governance_admin());
create policy "admins delete governance owners"
  on public.governance_owners
  for delete to authenticated
  using (public.is_governance_admin());
