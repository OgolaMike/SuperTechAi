# SuperTech AI — Cloudflare shadow environment

This folder is isolated from the live Bolt + Supabase application.

## Safety rules

- Supabase remains the production source of truth; Bolt remains the live website.
- Never change production DNS, Supabase records, or Bolt deployment from this shadow environment.
- Do not enable broker execution, payment processing, live push dispatch, or production scanner schedules in shadow mode.
- Keep Supabase Auth as the identity provider during the first shadow phase. Mirror only non-secret identity metadata into D1.
- Never copy passwords, recovery/session tokens, API keys, OAuth grants, VAPID private keys, webhook secrets, or broker credentials into source control or archive objects.
- R2 archive bucket must be private. Access must be mediated by an authenticated Worker.

## D1 and R2 setup

1. Create a D1 database named `supertechai-shadow`.
2. Create a private R2 bucket for historical archives.
3. Replace the placeholder D1 database ID and R2 bucket name in `worker/wrangler.toml`.
4. Apply migrations locally and validate them before applying remotely:
   - `npx wrangler d1 migrations apply supertechai-shadow --local`
   - `npx wrangler d1 migrations apply supertechai-shadow --remote`
5. Deploy only the shadow Worker and verify its health endpoint.
6. Do not connect the live frontend until separate approval.

## Historical retention and archive policy

The archive catalog is created by `d1/migrations/0002_archive_catalog.sql`.

- `signal_records`: keep the most recent 90 days hot in D1; older rows become eligible for archive.
- `push_events`: keep the most recent 90 days hot in D1; older payloads are archived privately.
- `scanner_candle_marks`: 30-day hot window, with archive-before-expiry for audit.
- `crypto_daily_movers` and `super_signal_records`: 365-day hot window.
- Financial and governance audit/ledger records are never expired; older data may be archived but must remain retrievable.

These are proposed shadow retention windows. They do not change Supabase retention. No row is deleted from D1 until its R2 object has been uploaded, decompressed/parsed, row-count verified, SHA-256 verified, and the archive manifest marked `verified`. In the initial migration, Supabase remains untouched regardless.

## Archive format and retrieval

Use immutable, date-partitioned gzip-compressed NDJSON objects in R2. Each object has one JSON record per line and a manifest containing table name, date range, row count, uncompressed/compressed sizes, SHA-256 checksum, and R2 object key. Preserve stable primary keys and timestamps. Archive reads must be authorized server-side and paginated; never expose the R2 bucket publicly.

A D1 archive manifest/catalog makes historical ranges discoverable. Historical queries should read the hot D1 window and fetch only the requested archive partitions from R2. Financial amounts must remain exact strings or integer minor units; never round through JavaScript floating point.

## Important implementation gate

The first generated D1 schema is a structural draft only. Before applying migrations, run SQLite validation and reconcile all 74 tables' columns, primary keys, foreign keys, indexes, checks and defaults. Translate all PostgreSQL RLS policies, SQL functions, triggers and auth dependencies into tested Worker authorization/business logic. Do not import live records until schema parity and a secure export/import process pass.

## Current status

- D1 baseline schema draft committed.
- Archive catalog and retention-policy draft committed.
- Worker health endpoint and D1/R2 binding scaffold committed.
- No D1 database or R2 bucket has been created in the Cloudflare account.
- No production records have been exported, copied, archived or deleted.
- Bolt + Supabase production remain unchanged.
