/*
# Dedicated pending-order push preference
*/
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS notify_pending_orders boolean NOT NULL DEFAULT true;
