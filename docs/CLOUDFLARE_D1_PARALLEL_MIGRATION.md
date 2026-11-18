# Cloudflare D1 Parallel Migration Plan

## Safety boundary

- Supabase remains the production backend and source of truth during this project.
- Bolt remains the production website and rollback target.
- This branch is isolated: `migration/cloudflare-d1-parallel`.
- No production DNS, Bolt deployment, Supabase schema, Supabase data, secrets, or scheduled jobs are changed by this preparation.
- D1 is a shadow environment until parity tests and a separately approved cutover.

## Target topology

- Frontend preview: Cloudflare Pages, built from this branch.
- API and background services: Cloudflare Workers.
- Relational data: Cloudflare D1 (SQLite).
- Object/file storage: Cloudflare R2 where appropriate.
- Scheduled work: Workers Cron Triggers and/or Queues/Workflows after workload validation.
- Existing production: Bolt + Supabase, unchanged.

## Repository baseline

- React 18 + Vite 5 + TypeScript.
- Current browser dependency includes `@supabase/supabase-js`.
- Build commands: `npm run typecheck`, `npm run lint`, `npm run build`.
- Current default branch: `main`.

## Supabase inventory observed (read-only, 2026-11-18)

The connected production project reports ACTIVE_HEALTHY. Public schema inventory includes 70 tables, all with RLS enabled. Key observed row counts:

| Table | Rows |
|---|---:|
| signal_records | 356,303 |
| push_events | 180,949 |
| scanner_candle_marks | 5,356 |
| crypto_daily_movers | 1,655 |
| super_signal_records | 294 |
| academy_videos | 76 |
| finance_member_profiles | 13 |
| member_access | 10 |
| founding_cohort | 10 |
| mt5_bridge_workers | 7 |
| admin_users | 5 |
| governance_owners | 5 |
| finance_owner_accounts | 5 |
| scanner_state | 1 |
| push_config | 1 |

The schema also includes member/auth-linked tables, referral and finance records, MT5 bridge and execution safety tables, cTrader OAuth/automation, Binance Spot/Futures, OKX Futures, governance, Academy, marketing, member alert preferences, NFC community cards/events, scanner leases and risk controls. A complete column/constraint export is still required before generating production-equivalent D1 migrations.

## Compatibility assessment

D1 is SQLite, not PostgreSQL. A PostgreSQL dump cannot be imported unchanged. Every schema and query must be reviewed for:
- UUID defaults and generation;
- JSONB operators and indexes;
- arrays (for example notification symbol filters);
- timestamptz/date/numeric types and precision;
- Postgres functions, triggers, RPCs and PL/pgSQL;
- RLS policies and auth.uid() dependencies;
- sequences, enums, check constraints and foreign keys;
- transaction and concurrency assumptions.

D1 does not provide Supabase Auth or Supabase Storage. Replacement decisions:
- Authentication: Cloudflare Access is not a direct consumer-app auth replacement. Evaluate a dedicated OIDC/auth provider or implement a carefully reviewed session system using Workers and a supported identity provider. Preserve email verification and recovery.
- Authorization: implement server-side authorization in Workers; never trust client-supplied roles. Translate every RLS policy into explicit tested access checks.
- Storage: R2 with private object access through authenticated Workers.
- Realtime: replace only where used, using Durable Objects/WebSockets or polling after feature inventory.
- Postgres RPC/triggers: move business logic into tested Worker services and explicit D1 transactions.

## D1 free-tier capacity gate

Current Cloudflare documentation lists D1 Free at 500 MB per database and 5 GB aggregate account storage, with 7-day Time Travel; Workers Free has 100,000 requests/day, 10 ms CPU per invocation and 5 Cron Triggers/account. D1 Free also enforces daily row-read/write quotas. These are hard design gates, not assumptions that this workload will fit. Measure exported database size and daily read/write demand before copying all historical data.

Cloudflare D1 import/export documentation states PostgreSQL dumps are not directly importable; data must be transformed to SQLite-compatible SQL. Large imports should be split into smaller files/statements and loaded in dependency order.

## Migration phases

1. **Inventory (read-only):** export complete table/column/index/constraint inventory; list views, functions, triggers, policies, buckets, auth configuration, cron jobs, vault secrets and function dependencies. Record exact counts and data sizes.
2. **Schema translation:** create versioned D1 migrations. Keep UUID identifiers stable. Store timestamps in UTC ISO-8601 text or integer epoch consistently. Preserve financial/trading decimals safely (avoid JS floating-point conversion; use scaled integers or canonical decimal text).
3. **Service port:** create Worker modules for scanner orchestration, signal persistence, push dispatch, referrals/finance, Academy, NFC and trading adapters. Port one service at a time. Do not activate broker execution in the shadow environment.
4. **Identity:** choose and test an auth provider, email verification, recovery, admin/member roles, session revocation and account linking. Password hashes must not be copied unless a supported, secure migration path is proven; otherwise use verified password-reset/re-enrolment.
5. **Data copy:** first schema, then low-risk reference data, then historical data in batches. Do not copy API keys, OAuth refresh tokens, VAPID private keys, webhook secrets or broker credentials into source files or plain-text exports. Re-provision secrets in Cloudflare secrets and re-authorize provider connections.
6. **Shadow validation:** compare table counts, stable IDs, representative row hashes, signal histories, financial ledger balances, ownership links and authorization tests. Run shadow reads only; no dual writes to production and no broker orders.
7. **Preview parity:** deploy preview Pages/Workers, test all user journeys and scheduled jobs with synthetic/test accounts.
8. **Cutover (separate approval required):** establish a freeze/catch-up strategy, backups, DNS switch and rollback. Bolt + Supabase remain available until explicit sign-off.

## Required acceptance tests

- Member login, logout, email verification and password recovery.
- Admin and member access boundaries; direct-object access and IDOR tests.
- Dashboard, watchlists, signal history and H4-primary signal decisions.
- Push subscriptions and all notification preferences.
- Referrals, payment records, finance ledger and withdrawals; balances reconcile exactly.
- Academy videos and private storage access.
- NFC card issuance, revocation, taps and attendance.
- Scanner idempotency, leases, retries and data freshness.
- cTrader/Binance/OKX connection state and risk controls; shadow mode only.
- Audit logs and secret redaction.
- Typecheck, lint, build, Worker tests, migration repeatability and backup/restore drill.

## Current status

- Created isolated branch from `main`.
- Inspected repository package baseline.
- Read-only Supabase inventory and Edge Function inventory obtained.
- No data has been copied yet. No Cloudflare account credentials or D1 database binding are available in this preparation session.
- Next safe implementation step: add a Cloudflare Worker/D1 scaffold and SQLite-native schema migrations after full schema and policy extraction. Do not create a live D1 database or deploy until Cloudflare account access and intended environment are confirmed.
