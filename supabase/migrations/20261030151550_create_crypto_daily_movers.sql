/*
# Create crypto daily movers snapshot

Stores one row per crypto pair per UTC trading day, so the app can show the previous day's top gainers and losers from Binance.

1. New Tables
- `crypto_daily_movers`: one row per (trade_date, symbol).
  - trade_date (date): the UTC day the candle covers.
  - symbol (text): Binance pair, e.g. BTCUSDT.
  - base_asset (text): the coin, e.g. BTC.
  - open_price, close_price, high_price, low_price (numeric): daily candle prices.
  - change_pct (numeric): (close - open) / open, in percent.
  - quote_volume (numeric): traded volume in USDT.
  - volume_rank (integer): rank by volume on the day the snapshot was taken.
  - captured_at (timestamptz): when the row was written.

2. Security
- Row level security is enabled.
- Anyone using the app (anon and signed-in users) may read rows. The data is public market data.
- Only the server-side refresh function (service role) may write rows. No public insert, update or delete.

3. Notes
- Writes are upserts keyed on (trade_date, symbol), so re-running a refresh never duplicates rows.
- The table is additive: no existing data is changed.
*/

CREATE TABLE IF NOT EXISTS crypto_daily_movers (
  trade_date date NOT NULL,
  symbol text NOT NULL,
  base_asset text NOT NULL,
  open_price numeric NOT NULL,
  close_price numeric NOT NULL,
  high_price numeric NOT NULL,
  low_price numeric NOT NULL,
  change_pct numeric NOT NULL,
  quote_volume numeric NOT NULL,
  volume_rank integer NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trade_date, symbol)
);

CREATE INDEX IF NOT EXISTS crypto_daily_movers_date_change_idx ON crypto_daily_movers (trade_date DESC, change_pct DESC);

ALTER TABLE crypto_daily_movers ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON crypto_daily_movers TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON crypto_daily_movers TO service_role;

DROP POLICY IF EXISTS "public_read_crypto_daily_movers" ON crypto_daily_movers;
CREATE POLICY "public_read_crypto_daily_movers" ON crypto_daily_movers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "service_write_crypto_daily_movers" ON crypto_daily_movers;
CREATE POLICY "service_write_crypto_daily_movers" ON crypto_daily_movers FOR ALL
  TO service_role USING (true) WITH CHECK (true);
