/*
# Create signal records

Stores every SMA 60 / Bollinger signal generated on the 7 supported timeframes,
with its fixed entry, stop-loss and three take-profit levels, and the moment
each level was hit on a confirmed candle close.

1. New Tables
- `signal_records`: one row per signal.
  - `signal_key` (text, primary key): symbol, timeframe, signal time and direction.
  - Asset and timeframe details: `symbol`, `asset_name`, `timeframe`, `granularity`, `digits`.
  - Signal: `direction` (BUY or SELL), `signal_epoch` (candle open time, seconds).
  - Levels fixed at signal time: `entry`, `stop_loss`, `tp1`, `tp2`, `tp3`, `band_mean`, `band_deviation`.
  - Hit times (seconds, null until hit): `tp1_hit_epoch`, `tp2_hit_epoch`, `tp3_hit_epoch`, `sl_hit_epoch`.
  - Outcome: `status` (Open, TP1, TP2, TP3 or Stopped) and `closed` (true once TP3 or the stop is hit).
  - Timestamps: `created_at`, `updated_at`.

2. Security
- Row level security is enabled on `signal_records`.
- The app has no sign-in screen and this data is intentionally shared, so anon and authenticated roles can read, insert and update rows.
- No delete access is granted, so records cannot be removed through the app.

3. Important notes
- Row creation and updates are idempotent: the same signal always maps to the same key.
- Indexes support newest-first listing and per-asset lookups.
*/

CREATE TABLE IF NOT EXISTS signal_records (
  signal_key text PRIMARY KEY,
  symbol text NOT NULL,
  asset_name text NOT NULL,
  timeframe text NOT NULL,
  granularity integer NOT NULL,
  digits integer NOT NULL DEFAULT 4,
  direction text NOT NULL CHECK (direction IN ('BUY', 'SELL')),
  signal_epoch bigint NOT NULL,
  entry double precision NOT NULL,
  stop_loss double precision NOT NULL,
  tp1 double precision NOT NULL,
  tp2 double precision NOT NULL,
  tp3 double precision NOT NULL,
  band_mean double precision NOT NULL,
  band_deviation double precision NOT NULL,
  tp1_hit_epoch bigint,
  tp2_hit_epoch bigint,
  tp3_hit_epoch bigint,
  sl_hit_epoch bigint,
  status text NOT NULL CHECK (status IN ('Open', 'TP1', 'TP2', 'TP3', 'Stopped')),
  closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signal_records_signal_epoch_idx ON signal_records (signal_epoch DESC);
CREATE INDEX IF NOT EXISTS signal_records_symbol_idx ON signal_records (symbol);

ALTER TABLE signal_records ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON signal_records TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_signal_records" ON signal_records;
CREATE POLICY "anon_select_signal_records" ON signal_records FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_signal_records" ON signal_records;
CREATE POLICY "anon_insert_signal_records" ON signal_records FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_signal_records" ON signal_records;
CREATE POLICY "anon_update_signal_records" ON signal_records FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
