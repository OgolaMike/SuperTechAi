-- Preserve governance authorization semantics while evaluating auth.uid() once per statement.
ALTER POLICY "owners create proposals" ON public.governance_proposals
  WITH CHECK ((public.is_governance_owner() OR public.is_governance_admin()) AND (created_by = (SELECT auth.uid())));

ALTER POLICY "owners update proposals" ON public.governance_proposals
  USING ((public.is_governance_owner() OR public.is_governance_admin()) AND ((created_by = (SELECT auth.uid())) OR public.is_governance_admin()));

ALTER POLICY "owners cast own vote" ON public.governance_votes
  WITH CHECK ((public.is_governance_owner() OR public.is_governance_admin()) AND (voter_id = (SELECT auth.uid())) AND EXISTS (
    SELECT 1 FROM public.governance_proposals p
    WHERE p.id = governance_votes.proposal_id
      AND p.status = 'open'
      AND (p.closes_at IS NULL OR p.closes_at > now())
  ));

ALTER POLICY "owners update own vote" ON public.governance_votes
  USING ((voter_id = (SELECT auth.uid())) AND (public.is_governance_owner() OR public.is_governance_admin()))
  WITH CHECK ((voter_id = (SELECT auth.uid())) AND (public.is_governance_owner() OR public.is_governance_admin()) AND EXISTS (
    SELECT 1 FROM public.governance_proposals p
    WHERE p.id = governance_votes.proposal_id
      AND p.status = 'open'
      AND (p.closes_at IS NULL OR p.closes_at > now())
  ));

ALTER POLICY "owners add discussion" ON public.governance_discussions
  WITH CHECK ((public.is_governance_owner() OR public.is_governance_admin()) AND (created_by = (SELECT auth.uid())));

ALTER POLICY "admins publish announcements" ON public.governance_announcements
  WITH CHECK (public.is_governance_admin() AND (published_by = (SELECT auth.uid())));

ALTER POLICY "owners acknowledge announcements" ON public.governance_announcement_reads
  WITH CHECK ((public.is_governance_owner() OR public.is_governance_admin()) AND (user_id = (SELECT auth.uid())));
