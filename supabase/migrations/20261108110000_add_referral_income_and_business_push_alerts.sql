/*
# Personal referral income and business push alerts

Adds per-device preference flags and recipient-scoped referral events.
Existing trading alerts remain broadcast according to their existing filters.
*/
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS notify_income boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_business boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.push_events
  ADD COLUMN IF NOT EXISTS recipient_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.push_events DROP CONSTRAINT IF EXISTS push_events_kind_check;
ALTER TABLE public.push_events
  ADD CONSTRAINT push_events_kind_check
  CHECK (kind IN ('signal', 'target', 'stop', 'limit_order', 'pending_order', 'super_signal', 'income', 'business'));

CREATE INDEX IF NOT EXISTS push_events_recipient_pending_idx
  ON public.push_events (recipient_user_id, created_at)
  WHERE dispatched_at IS NULL AND recipient_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.enqueue_referral_income_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_amount text;
BEGIN
  IF NEW.user_id IS NULL OR NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  v_amount := to_char(NEW.amount, 'FM999999990.000000');
  INSERT INTO public.push_events(event_key, signal_key, kind, payload, recipient_user_id)
  VALUES (
    'finance-income:' || NEW.id::text,
    'finance-income:' || NEW.id::text,
    'income',
    jsonb_build_object(
      'title', 'Income received · SuperTech AI',
      'message', '+' || v_amount || ' USDT credited to your account (' || replace(NEW.entry_type, '_', ' ') || ').',
      'eventType', 'income_credit',
      'eventEpoch', extract(epoch FROM NEW.created_at)::bigint
    ),
    NEW.user_id
  )
  ON CONFLICT (event_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_ledger_income_push ON public.finance_ledger_entries;
CREATE TRIGGER finance_ledger_income_push
AFTER INSERT ON public.finance_ledger_entries
FOR EACH ROW EXECUTE FUNCTION private.enqueue_referral_income_push();

CREATE OR REPLACE FUNCTION private.enqueue_referral_business_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.sponsor_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.sponsor_user_id IS NOT DISTINCT FROM NEW.sponsor_user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.push_events(event_key, signal_key, kind, payload, recipient_user_id)
  VALUES (
    'referral-joined:' || NEW.user_id::text || ':' || NEW.sponsor_user_id::text,
    'referral-joined:' || NEW.user_id::text,
    'business',
    jsonb_build_object(
      'title', 'New referral · SuperTech AI',
      'message', 'A new person has joined your referral network.',
      'eventType', 'referral_joined',
      'eventEpoch', extract(epoch FROM now())::bigint
    ),
    NEW.sponsor_user_id
  )
  ON CONFLICT (event_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_member_referral_business_push ON public.finance_member_profiles;
CREATE TRIGGER finance_member_referral_business_push
AFTER INSERT OR UPDATE OF sponsor_user_id ON public.finance_member_profiles
FOR EACH ROW EXECUTE FUNCTION private.enqueue_referral_business_push();

CREATE OR REPLACE FUNCTION private.enqueue_referral_activation_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status <> 'confirmed' OR OLD.status = 'confirmed' OR NEW.sponsor_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.push_events(event_key, signal_key, kind, payload, recipient_user_id)
  VALUES (
    'referral-activated:' || NEW.id::text || ':' || NEW.sponsor_user_id::text,
    'referral-activated:' || NEW.id::text,
    'business',
    jsonb_build_object(
      'title', 'Referral membership activated · SuperTech AI',
      'message', 'A member you referred has completed membership activation.',
      'eventType', 'referral_membership_activated',
      'eventEpoch', extract(epoch FROM coalesce(NEW.confirmed_at, now()))::bigint
    ),
    NEW.sponsor_user_id
  )
  ON CONFLICT (event_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_payment_referral_activation_push ON public.finance_payment_orders;
CREATE TRIGGER finance_payment_referral_activation_push
AFTER UPDATE OF status ON public.finance_payment_orders
FOR EACH ROW EXECUTE FUNCTION private.enqueue_referral_activation_push();

REVOKE ALL ON FUNCTION private.enqueue_referral_income_push() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.enqueue_referral_business_push() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.enqueue_referral_activation_push() FROM PUBLIC, anon, authenticated;
