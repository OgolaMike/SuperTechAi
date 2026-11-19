-- Core query and uniqueness indexes translated from the live Supabase public schema.
-- SQLite-compatible equivalents; intentionally limited to operationally critical tables.
-- Production Supabase is read-only and is not modified by this migration.

CREATE INDEX IF NOT EXISTS "signal_records_signal_epoch_idx"
  ON "signal_records" ("signal_epoch" DESC);
CREATE INDEX IF NOT EXISTS "signal_records_symbol_idx"
  ON "signal_records" ("symbol");
CREATE INDEX IF NOT EXISTS "super_signal_records_epoch_idx"
  ON "super_signal_records" ("signal_epoch" DESC);
CREATE INDEX IF NOT EXISTS "super_signal_records_symbol_epoch_idx"
  ON "super_signal_records" ("symbol", "signal_epoch" DESC);

CREATE INDEX IF NOT EXISTS "push_events_pending_idx"
  ON "push_events" ("created_at") WHERE "dispatched_at" IS NULL;
CREATE INDEX IF NOT EXISTS "push_events_recipient_pending_idx"
  ON "push_events" ("recipient_user_id", "created_at")
  WHERE "dispatched_at" IS NULL AND "recipient_user_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "crypto_daily_movers_date_change_idx"
  ON "crypto_daily_movers" ("trade_date" DESC, "change_pct" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "ctrader_connections_environment_ctrader_account_id_key"
  ON "ctrader_connections" ("environment", "ctrader_account_id");
CREATE INDEX IF NOT EXISTS "ctrader_connections_user_idx"
  ON "ctrader_connections" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ctrader_execution_events_connection_id_idx"
  ON "ctrader_execution_events" ("connection_id");
CREATE INDEX IF NOT EXISTS "ctrader_execution_events_intent_id_idx"
  ON "ctrader_execution_events" ("intent_id");
CREATE INDEX IF NOT EXISTS "ctrader_execution_events_user_idx"
  ON "ctrader_execution_events" ("user_id", "created_at" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "ctrader_execution_intents_connection_id_idempotency_key_key"
  ON "ctrader_execution_intents" ("connection_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "ctrader_intents_dispatch_idx"
  ON "ctrader_execution_intents" ("status", "created_at")
  WHERE "status" IN ('queued', 'leased', 'submitting', 'uncertain');
CREATE INDEX IF NOT EXISTS "ctrader_intents_lease_idx"
  ON "ctrader_execution_intents" ("connection_id", "status", "execution_lease_expires_at", "created_at")
  WHERE "status" IN ('queued', 'leased');
CREATE INDEX IF NOT EXISTS "ctrader_intents_member_idx"
  ON "ctrader_execution_intents" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ctrader_execution_settings_user_id_idx"
  ON "ctrader_execution_settings" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ctrader_positions_connection_id_broker_position_id_key"
  ON "ctrader_positions" ("connection_id", "broker_position_id");
CREATE INDEX IF NOT EXISTS "ctrader_positions_intent_id_idx"
  ON "ctrader_positions" ("intent_id");
CREATE INDEX IF NOT EXISTS "ctrader_positions_open_idx"
  ON "ctrader_positions" ("connection_id", "position_status")
  WHERE "position_status" IN ('open', 'closing');
CREATE INDEX IF NOT EXISTS "ctrader_positions_user_id_idx"
  ON "ctrader_positions" ("user_id");

CREATE INDEX IF NOT EXISTS "binance_futures_orders_user_created_idx"
  ON "binance_futures_orders" ("user_id", "created_at" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "binance_futures_orders_user_id_signal_key_key"
  ON "binance_futures_orders" ("user_id", "signal_key");
CREATE INDEX IF NOT EXISTS "binance_futures_positions_user_status_idx"
  ON "binance_futures_positions" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "binance_futures_signal_intents_symbol_epoch_idx"
  ON "binance_futures_signal_intents" ("symbol", "signal_epoch" DESC);
CREATE INDEX IF NOT EXISTS "binance_futures_signal_intents_user_created_idx"
  ON "binance_futures_signal_intents" ("user_id", "created_at" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "binance_futures_signal_intents_user_id_signal_key_key"
  ON "binance_futures_signal_intents" ("user_id", "signal_key");

CREATE INDEX IF NOT EXISTS "okx_futures_orders_intent_id_idx"
  ON "okx_futures_orders" ("intent_id");
CREATE UNIQUE INDEX IF NOT EXISTS "okx_futures_orders_user_id_signal_key_key"
  ON "okx_futures_orders" ("user_id", "signal_key");
CREATE INDEX IF NOT EXISTS "okx_futures_intents_pending_idx"
  ON "okx_futures_signal_intents" ("status", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "finance_member_profiles_referral_code_key"
  ON "finance_member_profiles" ("referral_code");
CREATE INDEX IF NOT EXISTS "finance_member_profiles_sponsor_idx"
  ON "finance_member_profiles" ("sponsor_user_id");
CREATE INDEX IF NOT EXISTS "finance_owner_user_idx"
  ON "finance_owner_accounts" ("user_id");
CREATE INDEX IF NOT EXISTS "governance_owners_added_by_idx"
  ON "governance_owners" ("added_by");
