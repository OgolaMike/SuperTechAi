/*
  Register the independent Market Structure SAR strategy alert event.
  It is signal-only; no broker execution or position management is enabled.
*/
ALTER TABLE public.push_events DROP CONSTRAINT IF EXISTS push_events_kind_check;
ALTER TABLE public.push_events
  ADD CONSTRAINT push_events_kind_check
  CHECK (kind IN ('signal', 'target', 'stop', 'limit_order', 'pending_order', 'super_signal', 'income', 'business', 'high_roc_stop', 'market_structure_sar'));
