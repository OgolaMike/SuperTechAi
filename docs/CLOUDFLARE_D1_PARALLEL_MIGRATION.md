# Cloudflare D1 Parallel Migration Plan

## Safety boundary

- Supabase remains the live production backend and source of truth.
- Bolt remains the live production website and rollback target.
- All D1 work is isolated to branch `migration/cloudflare-d1-parallel`.
- No production DNS, Bolt deployment, Supabase schema, Supabase data, secrets, or scheduled jobs have been changed.
- D1 is a shadow environment until parity tests pass and a separate cutover is explicitly approved.

## Target topology

| Live system | Parallel shadow system |
|---|---|
| Bolt hosting | Cloudflare Pages preview |
| Supabase Postgres | Cloudflare D1 |
| Supabase Edge Functions | Cloudflare Workers |
| Supabase Storage | Cloudflare R2 |
| Supabase Auth | Supabase Auth token verification initially; later identity migration only after separate design |

The shadow system must never write to production trading accounts, send real payment instructions, or dispatch live member notifications.

## Repository baseline and preparation

- React 18 + Vite 5 + TypeScript; `@supabase/supabase-js` remains unchanged in the live app.
- Branch: `migration/cloudflare-d1-parallel`.
- Added `cloudflare/d1/migrations/0001_initial_schema.sql`: baseline SQLite translation for all 74 current public tables.
- Added `cloudflare/worker/wrangler.toml` with a deliberately invalid placeholder D1 ID (must be replaced after creating the shadow database).
- Added a read-only `/health` Worker at `cloudflare/worker/src/index.ts`.
- Added setup and safety instructions in `cloudflare/README.md`.
- No root app code, Bolt configuration, Supabase configuration, or production environment variables were changed.

## Read-only production inventory (2026-11-18)

Connected Supabase project: `jtfsqhewotinvlrcadwq`, region `eu-west-2`, status `ACTIVE_HEALTHY`.

- 74 public tables; all 74 have Row Level Security enabled.
- 23 active Edge Functions.
- 97 recorded database migrations.
- 195 public indexes, 89 RLS policies, 11 public triggers, 33 public SQL functions, zero public views, and two Storage buckets.
- 13 auth users. User identities must be mapped; password hashes and recovery/session tokens are not copied into D1.
- Database size: approximately 318 MB.
- `signal_records`: 356,303 rows, approximately 106 MB.
- `push_events`: 180,949 rows, approximately 177 MB.
- Other notable tables: `scanner_candle_marks` 5,356 rows; `crypto_daily_movers` 1,655; `super_signal_records` 294; `academy_videos` 76; `binance_futures_signal_intents` 832.

The 318 MB PostgreSQL database size is a planning estimate, not the eventual D1 size. The 89 RLS policies and 33 SQL functions are not automatically carried over by the generated SQLite schema; each authorization rule and business function must be ported and tested. PostgreSQL table/index storage, SQLite encoding, and D1 indexes differ. Measure the imported D1 database before deciding that all history fits.

## Important D1 capacity risks

Current Cloudflare documentation lists D1 Free at 500 MB per database and 5 GB total account storage, 5 million rows read/day, and 100,000 rows written/day. Workers Free allows 100,000 requests/day, 10 ms CPU per invocation and five Cron Triggers per account. These limits are material for SuperTech AI's frequent scanner and high-volume signal/event tables. D1 also processes queries serially per database. See:
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/

**Initial recommendation:** use Free D1 only for a small shadow pilot and measured low-volume reads. Do not assume it can run the full production scanner workload for free. A one-minute cron is one trigger definition, but every run still consumes Worker CPU and D1 read/write quotas. Heavy scanner work must be batched, queue-driven, or run on a suitable paid/other compute service after measurement.

## PostgreSQL-to-SQLite compatibility

A PostgreSQL dump cannot be imported unchanged. The initial schema is a baseline, not a complete production-equivalent translation. Remaining work includes:
- indexes (including partial, expression, and unique indexes);
- check constraints and exact foreign-key actions;
- Postgres views, functions, triggers, RPCs and PL/pgSQL;
- JSONB operators, array semantics and JSON indexes;
- UUID generation, timestamps/time zones, enums, sequences and numeric precision;
- RLS policy equivalents and every `auth.uid()` dependency;
- Supabase Storage buckets/objects, Realtime subscriptions and scheduled jobs;
- function-to-function dependencies, Vault secrets and external integrations.

UUIDs and timestamps are represented as text in the baseline schema. Financial decimals are represented as text to avoid JavaScript floating-point rounding. Application code must generate UUIDs where PostgreSQL previously supplied `gen_random_uuid()`.

## Identity and security approach

For the first parallel phase, keep Supabase Auth as the identity authority and validate Supabase access tokens in the shadow Worker. Mirror only immutable user IDs, verified-email state and non-secret profile metadata into D1. The D1 `app_users` table is not a password store.

Do not copy password hashes, access/refresh tokens, recovery tokens, Binance/OKX/cTrader credentials, OAuth grants, VAPID private keys, webhook secrets or other service credentials into source control or plain-text exports. Re-provision required secrets through Cloudflare's encrypted secret mechanism. Preserve email verification and recovery.

All authorization must be enforced server-side in Workers. Translate RLS policies into explicit ownership, role and tenant checks and test IDOR cases. Never trust client-supplied admin/member roles.

## Historical data retention: D1 + private R2

The chosen design is not to discard history. Keep recent/high-query records in D1 and place older immutable history in a private R2 bucket as gzip-compressed, date-partitioned NDJSON. Keep a D1 archive manifest for discovery and integrity checks.

Initial shadow hot windows:
- `signal_records`: 90 days in D1; older partitions archive to R2.
- `push_events`: 90 days in D1; older event payloads archive to R2.
- `scanner_candle_marks`: 30 days hot, archive before expiry.
- `crypto_daily_movers` and `super_signal_records`: 365 days hot.
- Finance and governance audit/ledger history: never expire; archive older partitions but retain full retrieval.

These are shadow-system policies only. Supabase is not modified. A D1 row is eligible for removal only after the R2 object is uploaded, parsed/decompressed, row-count verified, SHA-256 verified, and its manifest marked verified. The first implementation must not delete any rows at all. R2 remains private; reads go through authenticated Worker routes. Do not archive credentials, password material, refresh tokens, broker keys, VAPID private keys or other secrets.

Added `cloudflare/d1/migrations/0002_archive_catalog.sql` with table policy and archive-job manifest structures. Added an R2 binding placeholder to Wrangler configuration. No Cloudflare resource has yet been created and no data has been exported or moved.

## Data-copy plan

1. Back up and inventory Supabase tables, columns, constraints, indexes, policies, views, functions, triggers, buckets, objects, Auth configuration, cron jobs and secrets.
2. Apply the baseline D1 migration to a local SQLite database and validate every table/column and foreign-key mapping.
3. Add translated indexes and business constraints before loading large history.
4. Export rows in deterministic primary-key batches; transform PostgreSQL values to SQLite-safe values without rounding decimals.
5. Load parent/reference tables before dependent tables. Use resumable batches and a per-table checkpoint ledger.
6. Copy public data only after reviewing each table's sensitivity. Copy credential-bearing tables only as empty structures until secure secret re-provisioning is designed.
7. Compare exact row counts, stable IDs, representative hashes, signal histories, financial ledger balances and referral ownership.
8. Test read-only shadow APIs with synthetic users; do not enable live trading, payments, or push dispatch.

Because `push_events` and `signal_records` account for most observed storage, first run a dry-run export-size estimate. If the complete data set exceeds the Free D1 database limit, do not silently truncate it: propose archival/partitioning or a paid capacity option for approval.

## Migration phases

1. **Inventory:** complete schema, indexes, policies, views, functions, triggers, buckets, secrets metadata and cron inventory.
2. **Schema parity:** SQLite-native D1 migrations, indexes, constraints and deterministic ID generation.
3. **Data export/import tooling:** resumable, table-by-table, batched transfer with checksums and no secret leakage.
4. **Worker services:** port signal reads/writes, scanner orchestration, push, referrals/finance, Academy, NFC and trading adapters one service at a time.
5. **Identity:** keep Supabase Auth during shadow testing; decide later whether to retain it or migrate to a dedicated identity provider. Never assume D1 supplies Supabase Auth.
6. **Shadow validation:** compare counts, hashes, ledger totals, authorization and feature journeys.
7. **Pages preview:** deploy preview Pages/Workers only after Cloudflare account access is connected.
8. **Cutover:** separate written approval required. Maintain Bolt + Supabase rollback until explicit sign-off.

## Acceptance tests

- Member login, logout, email verification and password recovery.
- Admin/member boundaries, row ownership and direct-object/IDOR tests.
- Dashboard, watchlists, signal history and H4-primary signal decisions.
- Push subscriptions, notification preferences and delivery simulation.
- Referrals, payment records, finance ledger and withdrawal reconciliation.
- Academy private video access and storage authorization.
- NFC card issuance, revocation, taps and attendance.
- Scanner idempotency, leases, retry behavior and data freshness.
- cTrader/Binance/OKX connection state and risk controls in shadow mode only.
- Secret redaction, audit trails, migration repeatability and backup/restore.

## Current status

- [x] Isolated migration branch exists.
- [x] Live Supabase table/function/migration inventory inspected read-only.
- [x] Baseline D1 schema draft for 74 public tables committed.
- [x] R2 archive catalog and initial hot-window policy committed.
- [x] Shadow Worker health endpoint and Wrangler binding scaffold committed.
- [ ] D1 database and private R2 bucket created in the user's Cloudflare account.
- [ ] Local SQLite schema validation and full index/constraint translation.
- [ ] Validate and repair baseline schema before applying; implement resumable export/import and archive verification pipeline.
- [ ] Worker service parity and authorization tests.
- [ ] Pages preview deployment.
- [ ] Production cutover (not authorized; do not perform).

No production data has been copied yet. No Cloudflare account credentials or D1 database binding were available in this session.