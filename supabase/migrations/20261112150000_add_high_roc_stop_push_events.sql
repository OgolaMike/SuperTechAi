/*
  Allow dedicated High ROC stop-entry signal alerts.
  These are signal-only proposals; no broker execution is enabled by this migration.
*/
ALTER TABLE public.push_events DROP CONSTRAINT IF EXISTS push_events_kind_check;
ALTER TABLE public.push_events
  ADD CONSTRAINT push_events_kind_check
  CHECK (kind IN ('signal', 'target', 'stop', 'limit_order', 'pending_order', 'super_signal', 'income', 'business', 'high_roc_stop'));
