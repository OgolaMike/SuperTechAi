-- Regenerated from the live Supabase public schema inventory on 2026-11-18.
-- SHADOW ONLY: no production data, credentials, or auth secrets are included.
-- Outgoing foreign keys only; auth.users references map to non-secret app_users identities.
-- UUIDs, timestamps, JSON and exact financial decimals are stored as TEXT.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  account_status TEXT NOT NULL DEFAULT 'active',
  mirrored_from TEXT NOT NULL DEFAULT 'supabase'
);

CREATE TABLE IF NOT EXISTS "signal_records" (
  "signal_key" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "asset_name" TEXT NOT NULL,
  "timeframe" TEXT NOT NULL,
  "granularity" INTEGER NOT NULL,
  "digits" INTEGER NOT NULL DEFAULT 4,
  "direction" TEXT NOT NULL,
  "signal_epoch" INTEGER NOT NULL,
  "entry" REAL NOT NULL,
  "stop_loss" REAL NOT NULL,
  "tp1" REAL NOT NULL,
  "tp2" REAL NOT NULL,
  "tp3" REAL NOT NULL,
  "band_mean" REAL NOT NULL,
  "band_deviation" REAL NOT NULL,
  "tp1_hit_epoch" INTEGER,
  "tp2_hit_epoch" INTEGER,
  "tp3_hit_epoch" INTEGER,
  "sl_hit_epoch" INTEGER,
  "status" TEXT NOT NULL,
  "closed" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "reversed_epoch" INTEGER,
  PRIMARY KEY ("signal_key")
);

CREATE TABLE IF NOT EXISTS "scanner_state" (
  "id" TEXT NOT NULL,
  "connection_status" TEXT NOT NULL DEFAULT 'idle',
  "last_run_at" TEXT,
  "last_success_at" TEXT,
  "last_scan_symbols" INTEGER NOT NULL DEFAULT 0,
  "last_scan_signals" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "last_error_at" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "scanner_candle_marks" (
  "symbol" TEXT NOT NULL,
  "granularity" INTEGER NOT NULL,
  "last_candle_epoch" INTEGER NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("symbol", "granularity")
);

CREATE TABLE IF NOT EXISTS "push_config" (
  "id" TEXT NOT NULL,
  "public_key" TEXT NOT NULL,
  "private_jwk" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "notify_signals" INTEGER NOT NULL DEFAULT 1,
  "notify_targets" INTEGER NOT NULL DEFAULT 1,
  "notify_stops" INTEGER NOT NULL DEFAULT 1,
  "user_agent" TEXT,
  "failure_count" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "last_success_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "symbols" TEXT,
  "notify_limit_orders" INTEGER NOT NULL DEFAULT 1,
  "notify_pending_orders" INTEGER NOT NULL DEFAULT 1,
  "notify_super_signals" INTEGER NOT NULL DEFAULT 1,
  "notify_income" INTEGER NOT NULL DEFAULT 1,
  "notify_business" INTEGER NOT NULL DEFAULT 1,
  "user_id" TEXT,
  PRIMARY KEY ("endpoint"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "push_events" (
  "event_key" TEXT NOT NULL,
  "signal_key" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "dispatched_at" TEXT,
  "recipient_user_id" TEXT,
  PRIMARY KEY ("event_key"),
  FOREIGN KEY ("recipient_user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "crypto_daily_movers" (
  "trade_date" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "base_asset" TEXT NOT NULL,
  "open_price" TEXT NOT NULL,
  "close_price" TEXT NOT NULL,
  "high_price" TEXT NOT NULL,
  "low_price" TEXT NOT NULL,
  "change_pct" TEXT NOT NULL,
  "quote_volume" TEXT NOT NULL,
  "volume_rank" INTEGER NOT NULL,
  "captured_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("trade_date", "symbol")
);

CREATE TABLE IF NOT EXISTS "admin_users" (
  "user_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("user_id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "member_access" (
  "user_id" TEXT NOT NULL,
  "approved_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("user_id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "mt5_account_settings" (
  "user_id" TEXT NOT NULL,
  "login" TEXT NOT NULL,
  "server" TEXT NOT NULL,
  "auto_trade_enabled" INTEGER NOT NULL DEFAULT 0,
  "adopt_pending_orders" INTEGER NOT NULL DEFAULT 0,
  "manage_existing_positions" INTEGER NOT NULL DEFAULT 0,
  "bridge_status" TEXT NOT NULL DEFAULT 'not_connected',
  "last_seen_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "place_new_orders" INTEGER NOT NULL DEFAULT 0,
  "risk_controls_enabled" INTEGER NOT NULL DEFAULT 0,
  "max_risk_per_trade_pct" TEXT NOT NULL DEFAULT 0.50,
  "max_daily_loss_pct" TEXT NOT NULL DEFAULT 2.00,
  "max_open_positions" INTEGER NOT NULL DEFAULT 3,
  "max_spread_points" INTEGER NOT NULL DEFAULT 0,
  "max_slippage_points" INTEGER NOT NULL DEFAULT 0,
  "live_execution_enabled" INTEGER NOT NULL DEFAULT 0,
  "emergency_stop" INTEGER NOT NULL DEFAULT 1,
  "unattended_execution_enabled" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("user_id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "mt5_bridge_workers" (
  "worker_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'offline',
  "version" TEXT,
  "last_seen_at" TEXT,
  "last_error_code" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "worker_token_hash" TEXT,
  PRIMARY KEY ("worker_id"),
  FOREIGN KEY ("user_id") REFERENCES "mt5_account_settings" ("user_id")
);

CREATE TABLE IF NOT EXISTS "mt5_bridge_commands" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "command_type" TEXT NOT NULL,
  "payload" TEXT NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'queued',
  "claimed_by" TEXT,
  "claimed_at" TEXT,
  "lease_expires_at" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "result" TEXT,
  "error_code" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "completed_at" TEXT,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "mt5_account_settings" ("user_id"),
  FOREIGN KEY ("claimed_by") REFERENCES "mt5_bridge_workers" ("worker_id")
);

CREATE TABLE IF NOT EXISTS "mt5_execution_audit" (
  "id" INTEGER NOT NULL,
  "user_id" TEXT NOT NULL,
  "worker_id" TEXT,
  "event_type" TEXT NOT NULL,
  "idempotency_key" TEXT,
  "details" TEXT NOT NULL DEFAULT '{}',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "mt5_account_settings" ("user_id")
);

CREATE TABLE IF NOT EXISTS "mt5_daily_risk_snapshots" (
  "user_id" TEXT NOT NULL,
  "utc_date" TEXT NOT NULL,
  "starting_balance" TEXT NOT NULL,
  "starting_equity" TEXT NOT NULL,
  "latest_balance" TEXT NOT NULL,
  "latest_equity" TEXT NOT NULL,
  "daily_equity_change_pct" TEXT NOT NULL DEFAULT 0,
  "first_observed_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "cash_flow_adjustment" TEXT NOT NULL DEFAULT 0,
  "realized_trading_net" TEXT NOT NULL DEFAULT 0,
  "deal_count" INTEGER NOT NULL DEFAULT 0,
  "history_complete" INTEGER NOT NULL DEFAULT 0,
  "latest_deal_epoch" INTEGER,
  PRIMARY KEY ("user_id", "utc_date"),
  FOREIGN KEY ("user_id") REFERENCES "mt5_account_settings" ("user_id")
);

CREATE TABLE IF NOT EXISTS "mt5_trade_inventory" (
  "id" INTEGER NOT NULL,
  "user_id" TEXT NOT NULL,
  "account_login" TEXT NOT NULL,
  "account_server" TEXT NOT NULL,
  "object_type" TEXT NOT NULL,
  "ticket" INTEGER NOT NULL,
  "identifier" INTEGER,
  "symbol" TEXT NOT NULL,
  "side_or_type" INTEGER NOT NULL,
  "volume" TEXT NOT NULL DEFAULT 0,
  "price_open" TEXT NOT NULL DEFAULT 0,
  "price_current" TEXT,
  "stop_loss" TEXT,
  "take_profit" TEXT,
  "profit" TEXT,
  "magic_number" INTEGER NOT NULL DEFAULT 0,
  "broker_reason" INTEGER,
  "broker_comment" TEXT NOT NULL DEFAULT '',
  "ownership_status" TEXT NOT NULL DEFAULT 'discovered_unowned',
  "first_seen_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "last_seen_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "last_sync_id" TEXT,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "mt5_account_settings" ("user_id")
);

CREATE TABLE IF NOT EXISTS "mt5_trade_adoption_audit" (
  "id" INTEGER NOT NULL,
  "user_id" TEXT NOT NULL,
  "account_login" TEXT NOT NULL,
  "account_server" TEXT NOT NULL,
  "object_type" TEXT NOT NULL,
  "ticket" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "previous_status" TEXT NOT NULL,
  "new_status" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "mt5_execution_attempts" (
  "command_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "worker_id" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "account_login" TEXT NOT NULL,
  "account_server" TEXT NOT NULL,
  "broker_comment" TEXT NOT NULL,
  "broker_ticket" INTEGER,
  "broker_deal" INTEGER,
  "broker_retcode" INTEGER,
  "broker_message" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("command_id"),
  FOREIGN KEY ("worker_id") REFERENCES "mt5_bridge_workers" ("worker_id"),
  FOREIGN KEY ("user_id") REFERENCES "mt5_account_settings" ("user_id"),
  FOREIGN KEY ("command_id") REFERENCES "mt5_bridge_commands" ("id")
);

CREATE TABLE IF NOT EXISTS "mt5_signal_intents" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "account_login" TEXT NOT NULL,
  "account_server" TEXT NOT NULL,
  "source_signal_key" TEXT NOT NULL,
  "strategy_version" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "timeframe" TEXT NOT NULL,
  "signal_epoch" INTEGER NOT NULL,
  "direction" TEXT NOT NULL,
  "order_type" TEXT NOT NULL,
  "entry" TEXT NOT NULL,
  "stop_loss" TEXT NOT NULL,
  "take_profit" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending_review',
  "payload" TEXT NOT NULL DEFAULT '{}',
  "expires_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "mt5_account_settings" ("user_id")
);

CREATE TABLE IF NOT EXISTS "finance_settings" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "network" TEXT NOT NULL DEFAULT 'TRC20',
  "membership_price" TEXT NOT NULL DEFAULT 300,
  "withdrawal_fee_pct" TEXT NOT NULL DEFAULT 15,
  "owner_share_pct" TEXT NOT NULL DEFAULT 35,
  "direct_pct" TEXT NOT NULL DEFAULT 30,
  "infinity_pct" TEXT NOT NULL DEFAULT 20,
  "unilevel_pct" TEXT NOT NULL DEFAULT 10,
  "lucky_pct" TEXT NOT NULL DEFAULT 5,
  "third_plus_direct_pct" TEXT NOT NULL DEFAULT 50,
  "treasury_address" TEXT,
  "usdt_contract" TEXT NOT NULL DEFAULT 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  "payment_expiry_minutes" INTEGER NOT NULL DEFAULT 120,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "company_referral_code" TEXT NOT NULL DEFAULT 'SUPERTECHAI',
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "finance_owner_accounts" (
  "owner_slot" INTEGER NOT NULL,
  "display_name" TEXT NOT NULL,
  "user_id" TEXT,
  "payout_address" TEXT,
  "active" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("owner_slot"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "finance_member_profiles" (
  "user_id" TEXT NOT NULL,
  "referral_code" TEXT NOT NULL,
  "sponsor_user_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "sponsor_account_code" TEXT,
  "payout_tron_address" TEXT,
  PRIMARY KEY ("user_id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id"),
  FOREIGN KEY ("sponsor_user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "finance_payment_orders" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "sponsor_user_id" TEXT,
  "referral_code" TEXT,
  "amount" TEXT NOT NULL DEFAULT 300,
  "network" TEXT NOT NULL DEFAULT 'TRC20',
  "token_contract" TEXT NOT NULL DEFAULT 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  "treasury_address" TEXT NOT NULL,
  "payer_address" TEXT,
  "tx_hash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "chain_payload" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "expires_at" TEXT NOT NULL,
  "confirmed_at" TEXT,
  "sponsor_account_code" TEXT,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id"),
  FOREIGN KEY ("sponsor_user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "finance_ledger_entries" (
  "id" TEXT NOT NULL,
  "account_code" TEXT NOT NULL,
  "user_id" TEXT,
  "owner_slot" INTEGER,
  "payment_order_id" TEXT,
  "withdrawal_id" TEXT,
  "entry_type" TEXT NOT NULL,
  "amount" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USDT',
  "idempotency_key" TEXT NOT NULL,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("owner_slot") REFERENCES "finance_owner_accounts" ("owner_slot"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id"),
  FOREIGN KEY ("payment_order_id") REFERENCES "finance_payment_orders" ("id")
);

CREATE TABLE IF NOT EXISTS "finance_withdrawal_requests" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "owner_slot" INTEGER,
  "account_code" TEXT NOT NULL,
  "gross_amount" TEXT NOT NULL,
  "fee_amount" TEXT NOT NULL,
  "net_amount" TEXT NOT NULL,
  "destination_address" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "tx_hash" TEXT,
  "rejection_reason" TEXT,
  "requested_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "processed_at" TEXT,
  "processed_by" TEXT,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("processed_by") REFERENCES "app_users" ("id"),
  FOREIGN KEY ("owner_slot") REFERENCES "finance_owner_accounts" ("owner_slot"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "finance_audit_log" (
  "id" INTEGER NOT NULL,
  "actor_user_id" TEXT,
  "event_type" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT,
  "details" TEXT NOT NULL DEFAULT '{}',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("actor_user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "founding_cohort" (
  "email" TEXT NOT NULL,
  "intended_role" TEXT NOT NULL,
  "auth_user_id" TEXT,
  "account_status" TEXT NOT NULL DEFAULT 'awaiting_account_recovery',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("email"),
  FOREIGN KEY ("auth_user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "ctrader_connections" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "ctrader_account_id" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "broker_name" TEXT NOT NULL DEFAULT 'Deriv',
  "account_label" TEXT,
  "account_currency" TEXT,
  "leverage" TEXT,
  "connection_status" TEXT NOT NULL DEFAULT 'pending',
  "access_token_secret_ref" TEXT,
  "refresh_token_secret_ref" TEXT,
  "token_expires_at" TEXT,
  "granted_scopes" TEXT NOT NULL,
  "last_connected_at" TEXT,
  "last_seen_at" TEXT,
  "last_error_code" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  UNIQUE ("id", "user_id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "ctrader_execution_settings" (
  "connection_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "automation_enabled" INTEGER NOT NULL DEFAULT 0,
  "unattended_execution_enabled" INTEGER NOT NULL DEFAULT 0,
  "allow_live_execution" INTEGER NOT NULL DEFAULT 0,
  "risk_per_trade_percent" TEXT NOT NULL DEFAULT 0.50,
  "daily_loss_limit_percent" TEXT NOT NULL DEFAULT 2.00,
  "max_open_positions" INTEGER NOT NULL DEFAULT 1,
  "max_spread_pips" TEXT NOT NULL DEFAULT 0,
  "allowed_symbols" TEXT NOT NULL,
  "strategy_version" TEXT NOT NULL DEFAULT 'supertech-ai-v1',
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("connection_id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id"),
  FOREIGN KEY ("connection_id", "user_id") REFERENCES "ctrader_connections" ("id", "user_id")
);

CREATE TABLE IF NOT EXISTS "ctrader_oauth_states" (
  "state_hash" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "redirect_path" TEXT NOT NULL DEFAULT '/',
  "expires_at" TEXT NOT NULL,
  "consumed_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("state_hash"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "ctrader_execution_intents" (
  "id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "source_signal_key" TEXT NOT NULL,
  "source_candle_epoch" INTEGER NOT NULL,
  "strategy_version" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "timeframe" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "order_kind" TEXT NOT NULL,
  "entry_price" TEXT,
  "stop_loss" TEXT NOT NULL,
  "take_profit" TEXT NOT NULL,
  "risk_percent" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "broker_order_id" TEXT,
  "broker_position_id" TEXT,
  "expires_at" TEXT,
  "request_payload" TEXT NOT NULL DEFAULT '{}',
  "result_payload" TEXT NOT NULL DEFAULT '{}',
  "last_error_code" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "completed_at" TEXT,
  "execution_lease_owner" TEXT,
  "execution_lease_expires_at" TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_attempt_at" TEXT,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id"),
  FOREIGN KEY ("connection_id") REFERENCES "ctrader_connections" ("id")
);

CREATE TABLE IF NOT EXISTS "ctrader_positions" (
  "id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "broker_position_id" TEXT NOT NULL,
  "broker_order_id" TEXT,
  "intent_id" TEXT,
  "symbol" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "volume" TEXT NOT NULL,
  "entry_price" TEXT NOT NULL,
  "stop_loss" TEXT,
  "take_profit" TEXT,
  "position_status" TEXT NOT NULL DEFAULT 'open',
  "strategy_owned" INTEGER NOT NULL DEFAULT 0,
  "opened_at" TEXT,
  "closed_at" TEXT,
  "broker_updated_at" TEXT,
  "sanitized_snapshot" TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY ("id"),
  FOREIGN KEY ("connection_id") REFERENCES "ctrader_connections" ("id"),
  FOREIGN KEY ("intent_id") REFERENCES "ctrader_execution_intents" ("id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "ctrader_runtime_leases" (
  "connection_id" TEXT NOT NULL,
  "lease_owner" TEXT NOT NULL,
  "lease_expires_at" TEXT NOT NULL,
  "heartbeat_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("connection_id"),
  FOREIGN KEY ("connection_id") REFERENCES "ctrader_connections" ("id")
);

CREATE TABLE IF NOT EXISTS "ctrader_daily_risk_snapshots" (
  "connection_id" TEXT NOT NULL,
  "risk_date" TEXT NOT NULL,
  "opening_equity" TEXT NOT NULL,
  "current_equity" TEXT NOT NULL,
  "realized_pnl" TEXT NOT NULL DEFAULT 0,
  "unrealized_pnl" TEXT NOT NULL DEFAULT 0,
  "loss_limit_reached" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("connection_id", "risk_date"),
  FOREIGN KEY ("connection_id") REFERENCES "ctrader_connections" ("id")
);

CREATE TABLE IF NOT EXISTS "ctrader_execution_events" (
  "id" INTEGER NOT NULL,
  "connection_id" TEXT,
  "user_id" TEXT,
  "intent_id" TEXT,
  "event_type" TEXT NOT NULL,
  "idempotency_key" TEXT,
  "details" TEXT NOT NULL DEFAULT '{}',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("intent_id") REFERENCES "ctrader_execution_intents" ("id"),
  FOREIGN KEY ("connection_id") REFERENCES "ctrader_connections" ("id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "ctrader_oauth_grants" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "encrypted_access_token" TEXT NOT NULL,
  "encrypted_refresh_token" TEXT NOT NULL,
  "token_expires_at" TEXT NOT NULL,
  "granted_scopes" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'account_discovery_pending',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "binance_spot_settings" (
  "user_id" TEXT NOT NULL,
  "connection_status" TEXT NOT NULL DEFAULT 'not_connected',
  "auto_trade_enabled" INTEGER NOT NULL DEFAULT 0,
  "live_execution_enabled" INTEGER NOT NULL DEFAULT 0,
  "emergency_stop" INTEGER NOT NULL DEFAULT 1,
  "quote_asset" TEXT NOT NULL DEFAULT 'USDT',
  "max_trade_usdt" TEXT NOT NULL DEFAULT 25,
  "max_open_positions" INTEGER NOT NULL DEFAULT 3,
  "allowed_symbols" TEXT NOT NULL,
  "api_key_last4" TEXT,
  "account_label" TEXT,
  "last_checked_at" TEXT,
  "last_error_code" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "risk_percent" TEXT NOT NULL DEFAULT 3,
  PRIMARY KEY ("user_id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "binance_spot_orders" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "order_kind" TEXT NOT NULL,
  "entry_price" TEXT NOT NULL,
  "quantity" TEXT NOT NULL,
  "stop_loss" TEXT,
  "take_profit" TEXT,
  "signal_key" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "broker_order_id" TEXT,
  "broker_order_list_id" TEXT,
  "client_order_id" TEXT NOT NULL,
  "request_payload" TEXT NOT NULL DEFAULT '{}',
  "result_payload" TEXT NOT NULL DEFAULT '{}',
  "last_error_code" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "completed_at" TEXT,
  "expires_at" TEXT,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "binance_spot_positions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "base_asset" TEXT NOT NULL,
  "quote_asset" TEXT NOT NULL DEFAULT 'USDT',
  "quantity" TEXT NOT NULL,
  "entry_price" TEXT NOT NULL,
  "stop_loss" TEXT,
  "take_profit" TEXT,
  "entry_order_id" TEXT,
  "exit_order_list_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "strategy_owned" INTEGER NOT NULL DEFAULT 1,
  "opened_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "closed_at" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id"),
  FOREIGN KEY ("entry_order_id") REFERENCES "binance_spot_orders" ("id")
);

CREATE TABLE IF NOT EXISTS "binance_spot_credentials" (
  "user_id" TEXT NOT NULL,
  "encrypted_api_key" TEXT NOT NULL,
  "encrypted_api_secret" TEXT NOT NULL,
  "api_key_last4" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "key_type" TEXT NOT NULL DEFAULT 'hmac',
  PRIMARY KEY ("user_id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "just4you_weekly_draws" (
  "id" TEXT NOT NULL,
  "week_start" TEXT NOT NULL,
  "week_end" TEXT NOT NULL,
  "qualifying_sales" TEXT NOT NULL,
  "prize_amount" TEXT NOT NULL,
  "eligible_members" INTEGER NOT NULL,
  "winner_user_id" TEXT,
  "winner_display_name" TEXT,
  "drawn_at" TEXT,
  "payout_status" TEXT NOT NULL DEFAULT 'pending',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("winner_user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "unilevel_auto_payouts" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "payout_month" TEXT NOT NULL,
  "gross_amount" TEXT NOT NULL,
  "fee_amount" TEXT NOT NULL,
  "net_amount" TEXT NOT NULL,
  "destination_address" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "tx_hash" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "paid_at" TEXT,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "academy_videos" (
  "id" TEXT NOT NULL,
  "lesson_id" TEXT NOT NULL,
  "lesson_title" TEXT NOT NULL,
  "provider_session_id" TEXT,
  "provider_video_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "video_url" TEXT,
  "thumbnail_url" TEXT,
  "failure_reason" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "screenshots" TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY ("id"),
  FOREIGN KEY ("created_by") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "super_signal_records" (
  "signal_key" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "asset_name" TEXT NOT NULL,
  "digits" INTEGER NOT NULL DEFAULT 4,
  "direction" TEXT NOT NULL,
  "signal_epoch" INTEGER NOT NULL,
  "entry" REAL NOT NULL,
  "stop_loss" REAL NOT NULL,
  "tp1" REAL NOT NULL,
  "tp2" REAL NOT NULL,
  "tp3" REAL NOT NULL,
  "daily_bias" TEXT NOT NULL DEFAULT 'No data',
  "reads" TEXT NOT NULL DEFAULT '[]',
  "explanation" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'Open',
  "tp1_hit_epoch" INTEGER,
  "tp2_hit_epoch" INTEGER,
  "tp3_hit_epoch" INTEGER,
  "sl_hit_epoch" INTEGER,
  "closed" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "band_mean" REAL NOT NULL DEFAULT 0,
  "band_deviation" REAL NOT NULL DEFAULT 0,
  "grade_percent" INTEGER,
  "confirmation_timeframe" TEXT,
  "confirmation_epoch" INTEGER,
  PRIMARY KEY ("signal_key")
);

CREATE TABLE IF NOT EXISTS "binance_futures_credentials" (
  "user_id" TEXT NOT NULL,
  "encrypted_api_key" TEXT NOT NULL,
  "encrypted_api_secret" TEXT NOT NULL,
  "api_key_last4" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "key_type" TEXT NOT NULL DEFAULT 'hmac',
  PRIMARY KEY ("user_id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "binance_futures_settings" (
  "user_id" TEXT NOT NULL,
  "connection_status" TEXT NOT NULL DEFAULT 'not_connected',
  "auto_trade_enabled" INTEGER NOT NULL DEFAULT 0,
  "live_execution_enabled" INTEGER NOT NULL DEFAULT 0,
  "emergency_stop" INTEGER NOT NULL DEFAULT 1,
  "leverage" INTEGER NOT NULL DEFAULT 1,
  "risk_percent" TEXT NOT NULL DEFAULT 0.50,
  "max_daily_loss_pct" TEXT NOT NULL DEFAULT 2.00,
  "max_open_positions" INTEGER NOT NULL DEFAULT 3,
  "allowed_symbols" TEXT NOT NULL,
  "account_label" TEXT,
  "api_key_last4" TEXT,
  "last_checked_at" TEXT,
  "last_error_code" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("user_id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "binance_futures_orders" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "signal_key" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "leverage" INTEGER NOT NULL,
  "quantity" TEXT NOT NULL,
  "entry_price" TEXT,
  "stop_loss" TEXT NOT NULL,
  "take_profit" TEXT NOT NULL,
  "risk_usdt" TEXT,
  "client_order_id" TEXT NOT NULL,
  "exchange_order_id" TEXT,
  "stop_order_id" TEXT,
  "take_profit_order_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "request_payload" TEXT NOT NULL DEFAULT '{}',
  "result_payload" TEXT NOT NULL DEFAULT '{}',
  "last_error_code" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "completed_at" TEXT,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "binance_futures_positions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "quantity" TEXT NOT NULL,
  "entry_price" TEXT NOT NULL,
  "mark_price" TEXT,
  "leverage" INTEGER NOT NULL,
  "unrealized_pnl" TEXT,
  "stop_loss" TEXT,
  "take_profit" TEXT,
  "source_signal_key" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "opened_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "closed_at" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "binance_futures_daily_risk" (
  "user_id" TEXT NOT NULL,
  "risk_date" TEXT NOT NULL,
  "start_wallet_balance" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("user_id", "risk_date"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "binance_futures_signal_intents" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "signal_key" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "timeframe_agreement" INTEGER NOT NULL,
  "signal_epoch" INTEGER NOT NULL,
  "entry_price" TEXT NOT NULL,
  "stop_loss" TEXT NOT NULL,
  "take_profit" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'signal_ready',
  "payload" TEXT NOT NULL DEFAULT '{}',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "governance_owners" (
  "user_id" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'owner',
  "active" INTEGER NOT NULL DEFAULT 1,
  "added_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("user_id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id"),
  FOREIGN KEY ("added_by") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "governance_proposals" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "status" TEXT NOT NULL DEFAULT 'open',
  "created_by" TEXT NOT NULL,
  "closes_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("created_by") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "governance_votes" (
  "id" TEXT NOT NULL,
  "proposal_id" TEXT NOT NULL,
  "voter_id" TEXT NOT NULL,
  "choice" TEXT NOT NULL,
  "rationale" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("proposal_id") REFERENCES "governance_proposals" ("id"),
  FOREIGN KEY ("voter_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "governance_discussions" (
  "id" TEXT NOT NULL,
  "proposal_id" TEXT,
  "body" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("created_by") REFERENCES "app_users" ("id"),
  FOREIGN KEY ("proposal_id") REFERENCES "governance_proposals" ("id")
);

CREATE TABLE IF NOT EXISTS "governance_announcements" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "published_by" TEXT NOT NULL,
  "published_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "archived_at" TEXT,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("published_by") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "governance_announcement_reads" (
  "announcement_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "read_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("announcement_id", "user_id"),
  FOREIGN KEY ("announcement_id") REFERENCES "governance_announcements" ("id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "governance_audit_log" (
  "id" INTEGER NOT NULL,
  "actor_id" TEXT,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT,
  "details" TEXT NOT NULL DEFAULT '{}',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("actor_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "okx_futures_credentials" (
  "user_id" TEXT NOT NULL,
  "encrypted_api_key" TEXT NOT NULL,
  "encrypted_api_secret" TEXT NOT NULL,
  "encrypted_passphrase" TEXT NOT NULL,
  "api_key_last4" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("user_id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "okx_futures_settings" (
  "user_id" TEXT NOT NULL,
  "connection_status" TEXT NOT NULL DEFAULT 'not_connected',
  "demo_trading" INTEGER NOT NULL DEFAULT 1,
  "auto_trade_enabled" INTEGER NOT NULL DEFAULT 0,
  "live_execution_enabled" INTEGER NOT NULL DEFAULT 0,
  "emergency_stop" INTEGER NOT NULL DEFAULT 1,
  "leverage" INTEGER NOT NULL DEFAULT 1,
  "risk_percent" TEXT NOT NULL DEFAULT 0.50,
  "max_daily_loss_pct" TEXT NOT NULL DEFAULT 2,
  "max_open_positions" INTEGER NOT NULL DEFAULT 3,
  "api_key_last4" TEXT,
  "account_label" TEXT,
  "account_mode" TEXT,
  "last_checked_at" TEXT,
  "last_error_code" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("user_id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "academy_trade_reviews" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "timeframe" TEXT NOT NULL,
  "opened_at" TEXT,
  "closed_at" TEXT,
  "entry_price" TEXT NOT NULL,
  "exit_price" TEXT NOT NULL,
  "realized_pnl" TEXT,
  "realized_pnl_pct" TEXT,
  "setup_summary" TEXT NOT NULL,
  "why_entry" TEXT NOT NULL,
  "what_confirmed" TEXT NOT NULL,
  "risk_lesson" TEXT NOT NULL,
  "chart_image_url" TEXT,
  "source_trade_ref" TEXT,
  "verified_by" TEXT,
  "published" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("verified_by") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "academy_trade_discussions" (
  "id" TEXT NOT NULL,
  "review_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "comment" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("review_id") REFERENCES "academy_trade_reviews" ("id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "okx_futures_signal_intents" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "signal_key" TEXT NOT NULL,
  "inst_id" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "timeframe_agreement" INTEGER NOT NULL DEFAULT 8,
  "signal_epoch" INTEGER NOT NULL,
  "entry_price" TEXT NOT NULL,
  "stop_loss" TEXT NOT NULL,
  "take_profit" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'signal_ready',
  "payload" TEXT NOT NULL DEFAULT '{}',
  "exchange_order_id" TEXT,
  "exchange_algo_id" TEXT,
  "failure_reason" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "okx_futures_orders" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "intent_id" TEXT,
  "signal_key" TEXT NOT NULL,
  "inst_id" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "sz" TEXT NOT NULL,
  "entry_price" TEXT,
  "stop_loss" TEXT NOT NULL,
  "take_profit" TEXT NOT NULL,
  "leverage" INTEGER NOT NULL,
  "exchange_order_id" TEXT NOT NULL,
  "exchange_algo_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'submitted',
  "demo_trading" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("intent_id") REFERENCES "okx_futures_signal_intents" ("id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "okx_futures_daily_risk" (
  "user_id" TEXT NOT NULL,
  "risk_date" TEXT NOT NULL,
  "start_equity" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("user_id", "risk_date"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "marketing_campaigns" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "campaign_type" TEXT NOT NULL DEFAULT 'product',
  "headline" TEXT NOT NULL,
  "details" TEXT NOT NULL DEFAULT '',
  "event_date" TEXT,
  "event_time" TEXT,
  "venue" TEXT,
  "call_to_action" TEXT NOT NULL DEFAULT '',
  "caption" TEXT NOT NULL DEFAULT '',
  "creative_url" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "member_alert_preferences" (
  "user_id" TEXT NOT NULL,
  "categories" TEXT NOT NULL DEFAULT '{}',
  "assets" TEXT NOT NULL DEFAULT '{}',
  "default_asset_mode" TEXT NOT NULL DEFAULT 'bubble',
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("user_id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "academy_ai_lessons" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'Beginner',
  "duration_minutes" INTEGER NOT NULL DEFAULT 5,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "model" TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
  "generated_by" TEXT,
  "published_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("generated_by") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "academy_ai_discussions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "lesson_id" TEXT,
  "question" TEXT NOT NULL,
  "ai_response" TEXT NOT NULL,
  "model" TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id"),
  FOREIGN KEY ("lesson_id") REFERENCES "academy_ai_lessons" ("id")
);

CREATE TABLE IF NOT EXISTS "academy_ai_discussion_topics" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "discussion_prompt" TEXT NOT NULL,
  "context" TEXT NOT NULL,
  "talking_points" TEXT NOT NULL DEFAULT '[]',
  "follow_up_questions" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "model" TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
  "generated_by" TEXT,
  "published_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("generated_by") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "scanner_execution_leases" (
  "lease_name" TEXT NOT NULL,
  "lease_token" TEXT NOT NULL,
  "lease_until" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("lease_name")
);

CREATE TABLE IF NOT EXISTS "binance_futures_daily_equity" (
  "user_id" TEXT NOT NULL,
  "trading_day" TEXT NOT NULL,
  "baseline_equity" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("user_id", "trading_day"),
  FOREIGN KEY ("user_id") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "nfc_member_cards" (
  "id" TEXT NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "card_code" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "card_type" TEXT NOT NULL DEFAULT 'standard',
  "status" TEXT NOT NULL DEFAULT 'active',
  "issued_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "last_tapped_at" TEXT,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("owner_user_id") REFERENCES "app_users" ("id"),
  FOREIGN KEY ("issued_by") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "nfc_tap_events" (
  "id" TEXT NOT NULL,
  "card_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "event_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("card_id") REFERENCES "nfc_member_cards" ("id")
);

CREATE TABLE IF NOT EXISTS "nfc_community_events" (
  "id" TEXT NOT NULL,
  "event_code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "starts_at" TEXT,
  "ends_at" TEXT,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("created_by") REFERENCES "app_users" ("id")
);

CREATE TABLE IF NOT EXISTS "nfc_event_attendance" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "card_id" TEXT NOT NULL,
  "member_user_id" TEXT NOT NULL,
  "checked_in_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("event_id") REFERENCES "nfc_community_events" ("id"),
  FOREIGN KEY ("card_id") REFERENCES "nfc_member_cards" ("id"),
  FOREIGN KEY ("member_user_id") REFERENCES "app_users" ("id")
);
