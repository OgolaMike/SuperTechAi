CREATE TABLE IF NOT EXISTS public.member_alert_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  categories jsonb NOT NULL DEFAULT '{}'::jsonb,
  assets jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_asset_mode text NOT NULL DEFAULT 'bubble'
    CHECK (default_asset_mode IN ('full', 'bubble', 'muted')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_alert_categories_object CHECK (jsonb_typeof(categories) = 'object'),
  CONSTRAINT member_alert_assets_object CHECK (jsonb_typeof(assets) = 'object')
);

ALTER TABLE public.member_alert_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.member_alert_preferences TO authenticated;
REVOKE ALL ON public.member_alert_preferences FROM anon;

DROP POLICY IF EXISTS "Members read own alert preferences" ON public.member_alert_preferences;
CREATE POLICY "Members read own alert preferences"
  ON public.member_alert_preferences FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Members insert own alert preferences" ON public.member_alert_preferences;
CREATE POLICY "Members insert own alert preferences"
  ON public.member_alert_preferences FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Members update own alert preferences" ON public.member_alert_preferences;
CREATE POLICY "Members update own alert preferences"
  ON public.member_alert_preferences FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
