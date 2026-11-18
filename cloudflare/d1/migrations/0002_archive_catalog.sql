-- Historical archive catalog for the SuperTech AI shadow environment.
-- This migration does not delete or move any production or D1 rows.
-- Archive payloads are immutable compressed NDJSON objects in a private R2 bucket.

CREATE TABLE IF NOT EXISTS archive_table_policy (
  table_name TEXT PRIMARY KEY,
  active_window_days INTEGER NOT NULL,
  archive_enabled INTEGER NOT NULL DEFAULT 1 CHECK (archive_enabled IN (0, 1)),
  date_column TEXT NOT NULL,
  sensitivity TEXT NOT NULL DEFAULT 'standard'
    CHECK (sensitivity IN ('standard', 'restricted', 'never_archive')),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS archive_jobs (
  archive_id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  uncompressed_bytes INTEGER NOT NULL DEFAULT 0,
  compressed_bytes INTEGER NOT NULL DEFAULT 0,
  checksum_sha256 TEXT,
  r2_object_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'exporting', 'uploaded', 'verified', 'failed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  verified_at TEXT,
  error_message TEXT,
  UNIQUE (table_name, date_from, date_to)
);

CREATE INDEX IF NOT EXISTS idx_archive_jobs_table_status
  ON archive_jobs(table_name, status);

CREATE INDEX IF NOT EXISTS idx_archive_jobs_date_range
  ON archive_jobs(date_from, date_to);

-- High-volume append-only history is kept hot for 90 days in D1.
-- Older records are eligible for R2 archival only after checksum/count verification.
INSERT OR IGNORE INTO archive_table_policy
  (table_name, active_window_days, date_column, sensitivity, notes)
VALUES
  ('signal_records', 90, 'created_at', 'standard',
   'Archive older signal history to R2; preserve stable signal_key and searchable metadata.'),
  ('push_events', 90, 'created_at', 'restricted',
   'Archive old notification event payloads privately; exclude subscription endpoints and credentials.'),
  ('scanner_candle_marks', 30, 'updated_at', 'standard',
   'Operational marks can be rebuilt; archive for audit before any expiry.'),
  ('crypto_daily_movers', 365, 'trade_date', 'standard',
   'Retain one year hot; older daily market snapshots may be archived.'),
  ('super_signal_records', 365, 'created_at', 'standard',
   'Keep recent super-signal history hot; archive older history.'),
  ('finance_audit_log', 0, 'created_at', 'restricted',
   'Never expire financial audit history; archive older records but retain full audit availability.'),
  ('finance_ledger_entries', 0, 'created_at', 'restricted',
   'Never expire financial ledger history; archive older records but retain full audit availability.'),
  ('governance_audit_log', 0, 'created_at', 'restricted',
   'Never expire governance audit history; archive older records but retain full audit availability.');
