/*
# Limit-order push events
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS notify_limit_orders boolean NOT NULL DEFAULT true;
ALTER TABLE push_events DROP CONSTRAINT IF EXISTS push_events_kind_check;
ALTER TABLE push_events
  ADD CONSTRAINT push_events_kind_check
  CHECK (kind IN ('signal', 'target', 'stop', 'limit_order'));
