/*
# Allow dedicated Super Signal push events
*/
ALTER TABLE push_events DROP CONSTRAINT IF EXISTS push_events_kind_check;
ALTER TABLE push_events
  ADD CONSTRAINT push_events_kind_check
  CHECK (kind IN ('signal', 'target', 'stop', 'limit_order', 'pending_order', 'super_signal'));
