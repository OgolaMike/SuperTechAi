/*
# Dedicated Super Signal push preference
*/
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS notify_super_signals boolean NOT NULL DEFAULT true;
