/*
# Pending-order push events
Allow the scanner to queue BB(60, 2.5) two-candle reversal alerts for devices
that have enabled the existing pending/limit-order notification preference.
*/
ALTER TABLE push_events DROP CONSTRAINT IF EXISTS push_events_kind_check;
ALTER TABLE push_events
  ADD CONSTRAINT push_events_kind_check
  CHECK (kind IN ('signal', 'target', 'stop', 'limit_order', 'pending_order'));
