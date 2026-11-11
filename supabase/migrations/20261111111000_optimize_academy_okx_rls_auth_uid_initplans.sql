-- Evaluate auth.uid() once per statement while preserving existing ownership and admin checks.
ALTER POLICY "approved members comment on published trade reviews"
ON public.academy_trade_discussions
WITH CHECK (
  user_id = (select auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.member_access m
    WHERE m.user_id = (select auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM public.academy_trade_reviews r
    WHERE r.id = academy_trade_discussions.review_id
      AND r.published = true
  )
);

ALTER POLICY "admins delete academy trade reviews"
ON public.academy_trade_reviews
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users a
    WHERE a.user_id = (select auth.uid())
  )
);

ALTER POLICY "admins publish academy trade reviews"
ON public.academy_trade_reviews
WITH CHECK (
  verified_by = (select auth.uid())
  AND published = true
  AND EXISTS (
    SELECT 1 FROM public.admin_users a
    WHERE a.user_id = (select auth.uid())
  )
  AND realized_pnl_pct > 0
);

ALTER POLICY "admins update academy trade reviews"
ON public.academy_trade_reviews
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users a
    WHERE a.user_id = (select auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admin_users a
    WHERE a.user_id = (select auth.uid())
  )
);

ALTER POLICY "Users read own OKX daily risk"
ON public.okx_futures_daily_risk
USING ((select auth.uid()) = user_id);

ALTER POLICY "Users read own OKX orders"
ON public.okx_futures_orders
USING ((select auth.uid()) = user_id);

ALTER POLICY "Users read own OKX intents"
ON public.okx_futures_signal_intents
USING ((select auth.uid()) = user_id);
