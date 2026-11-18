# Appwrite migration assessment — SuperTech AI

**Status:** Research/preparation only. Supabase remains the production backend.
**Prepared:** 2026-11-18
**Repository branch:** `research/appwrite-migration-assessment`

## Executive decision

Do **not** switch SuperTech AI from Supabase to Appwrite Cloud Free yet. Appwrite is a credible backend, but the current application is too dependent on PostgreSQL-specific behavior and has too many backend jobs for the Appwrite Cloud Free limits. A rushed migration would risk member access, signal history, scheduled scanning, notification delivery, referrals/finance records, and trading automation.

The safe next step is a small Appwrite sandbox proof-of-concept using synthetic data only. Keep production Supabase connected and authoritative until every acceptance test in this document passes.

## What was inspected

- GitHub repository: `OgolaMike/SuperTechAi`, default branch `main`.
- Frontend: React 18 + Vite 5 + TypeScript. The package currently depends on `@supabase/supabase-js`.
- Supabase project: `jtfsqhewotinvlrcadwq` (SuperTech AI), region `eu-west-2`, status `ACTIVE_HEALTHY`, PostgreSQL 17.
- Repository contains 24 Edge Function directories (excluding the shared helper directory).
- Production database inventory includes a broad set of public tables and PostgreSQL functions, triggers, RLS policies, cron jobs and service-role workflows.
- Selected live row counts observed during read-only inventory:
  - `signal_records`: 356,303
  - `push_events`: 180,949
  - `scanner_candle_marks`: 5,356
  - `crypto_daily_movers`: 1,655
  - `binance_futures_signal_intents`: 832
  - `super_signal_records`: 294
  - `academy_videos`: 76
  - `member_access`: 10
  - `admin_users`: 5
- Scanner scheduling migration in the repository describes a one-minute schedule. This is important because Appwrite Cloud Free scheduled intervals have a 60-minute minimum.

Counts are an inventory snapshot, not a complete export or backup. No production rows, users, keys, functions, secrets, or settings were changed.

## Appwrite Cloud Free: relevant current limits

Verified against Appwrite's pricing and Free-plan documentation on 2026-11-18:

- 2 Functions per project.
- 1 database per project and 1 bucket per project.
- 750,000 function executions/month; 100 GB-hours/month.
- 5 GB API bandwidth/month and 2 GB storage.
- 75,000 monthly active users.
- 500,000 database reads/month and 250,000 writes/month.
- 250 concurrent Realtime connections and 2 million Realtime messages/month.
- Free-plan scheduled intervals are 60 minutes or longer.
- When a Free-plan resource limit is reached, affected capabilities can be disabled/frozen until the limit resets or the plan changes.

Sources:
- https://appwrite.io/pricing
- https://appwrite.io/docs/advanced/billing/free
- https://appwrite.io/docs/products/functions/execute
- https://appwrite.io/changelog/entry/2026-01-08

**Assessment:** The 2-function limit and 60-minute minimum schedule are immediate blockers for a direct, free-tier replacement of the current multi-function, one-minute scanner system. The historical data volume also makes the read/write quota and storage/bandwidth capacity something to measure before committing.

## Supabase-to-Appwrite migration support and limitations

Appwrite's official Supabase migration guide says:
- Users: automatic migration.
- Databases: automatic migration.
- Rows: partial migration.
- Files: automatic migration.
- Functions: manual rewrite.

It also explicitly warns that PostgreSQL-specific features such as advanced indexes, Postgres functions and scheduling are not migrated. OAuth users need to authenticate again. Permissions must be reviewed after migration.

Sources:
- https://appwrite.io/integrations/migrations-supabase
- https://appwrite.io/docs/advanced/migrations/supabase

This means the migration wizard is a starting point, not a complete port of SuperTech AI.

## Main compatibility risks

| Current SuperTech AI capability | Appwrite migration impact | Required work |
|---|---|---|
| PostgreSQL schema, SQL views/functions/triggers | Not a one-to-one mapping to Appwrite TablesDB | Inventory each dependency; rewrite logic as Appwrite Functions or move to PostgreSQL-compatible hosting |
| RLS policies and `auth.uid()` checks | Appwrite uses resource permissions and teams/roles | Rebuild and independently test every read/write boundary |
| Supabase Auth and verified-email flows | Users can be migrated, but session/JWT model changes | Verify imported credentials, verification state, recovery, admin roles and forced re-login behavior |
| 24 Edge Function directories | Functions are manual rewrites; Free allows 2 | Consolidate only where safe or host compute elsewhere; do not place trading execution behind a single untested router |
| One-minute scanner schedule | Appwrite Free scheduled intervals cannot run every minute | Keep scanner on Supabase during transition; evaluate Cloudflare Cron/Workers or paid Appwrite only after load tests |
| Realtime signal/push events | Different subscription and permission model | Rebuild subscriptions and test message volume/latency |
| Private video/file storage | Bucket and permission model differs | Recreate buckets and access controls; verify signed/private access |
| Trading credentials, OAuth grants, execution intents, risk guards | High-risk secret and financial workflows | Keep in Supabase until a separately audited replacement is proven; never copy secrets into client-readable documents |
| Referrals, finance ledger, payouts and owner governance | Relational constraints and transactional invariants need careful porting | Model transactions/idempotency/audit trail and reconcile totals before any cutover |

## Proposed target architecture (only after proof-of-concept)

- Cloudflare Pages: React/Vite frontend hosting.
- Appwrite: candidate identity, database, file storage and realtime services.
- Cloudflare Workers: candidate API orchestration and scheduled/background compute if Appwrite Free function/scheduler limits are insufficient.
- GitHub: source of truth and isolated migration branch.
- Supabase: production system of record until final acceptance and explicit cutover approval.

This is a candidate design, not an implemented or connected deployment. Do not point production frontend environment variables at Appwrite yet.

## Migration work plan

### Phase 0 — Protect production (required before any migration)
1. Keep Supabase project active and current frontend configuration unchanged.
2. Take and verify a full database backup plus storage inventory.
3. Export schema, RLS policies, functions, triggers, cron jobs, secrets inventory (names only), auth configuration, and storage policies.
4. Record current baseline counts and key business invariants.
5. Never export or commit passwords, API keys, exchange credentials, OAuth refresh tokens, signing secrets or service-role keys.

### Phase 1 — Create isolated Appwrite sandbox
1. Create a new Appwrite project manually in the user's Appwrite account.
2. Add only a test web platform (local/dev origin).
3. Configure email verification and recovery in the sandbox.
4. Create a small synthetic schema for member profile, sample signal, push preference and audit event.
5. Test signup, verification, login, recovery, permissions, realtime and file access.
6. Do not connect the sandbox to production users or credentials.

### Phase 2 — Prove the data model
1. Map each Supabase table, primary key, foreign key, unique constraint, check constraint, index, trigger and RPC.
2. Identify which data can map to Appwrite TablesDB and which needs PostgreSQL/Workers.
3. Test a small synthetic import and compare row counts, identifiers, nulls, timestamps and relationships.
4. Do not assume the Appwrite migration wizard preserves all constraints or SQL behavior.

### Phase 3 — Prove backend jobs
1. Prototype only non-trading, non-financial endpoints first.
2. Test scanner scheduling independently; Free Appwrite schedules cannot meet the current one-minute schedule.
3. Keep live trading executors, credentials, OAuth grants and payout logic on Supabase.
4. Load-test execution quotas, memory/runtime, retry behavior, idempotency and observability.

### Phase 4 — Dual-run and acceptance
1. If approved later, copy a limited, non-sensitive dataset into a staging Appwrite project.
2. Compare read results and business calculations against Supabase.
3. Test user permissions with separate member/admin accounts.
4. Test email verification and recovery end-to-end.
5. Test signals, push subscriptions, referrals, finance ledger reconciliation, academy private files, NFC flows and trading intent safety.
6. No production dual-write until conflict handling, replay and reconciliation are proven.

### Phase 5 — Cutover (not authorized by this preparation task)
Only after explicit owner approval: schedule a maintenance window, freeze writes, take final backup, migrate final delta, validate counts/invariants, switch environment configuration, monitor, and retain a documented rollback path to Supabase.

## Acceptance gates

- [ ] Verified backup and restore procedure.
- [ ] No production changes during evaluation.
- [ ] All required tables and relationships accounted for.
- [ ] No loss of member identity, approval, admin role or email verification state.
- [ ] Password migration tested; forced password reset/re-auth plan documented if needed.
- [ ] RLS-equivalent permissions tested for every role.
- [ ] One-minute scanner cadence maintained by a proven scheduler.
- [ ] Realtime and push delivery verified.
- [ ] Finance ledger totals and referral calculations reconcile exactly.
- [ ] Trading credentials remain private; idempotent execution and risk controls pass tests.
- [ ] Appwrite quotas and total monthly cost modeled from measured usage.
- [ ] Rollback tested.
- [ ] Explicit owner approval obtained before production cutover.

## Current recommendation

For the current build stage, keep Supabase Free as the live backend and move the frontend hosting separately to Cloudflare Pages when ready. Appwrite is worth a sandbox proof-of-concept, but Appwrite Cloud Free is not presently a safe drop-in replacement for this workload. If the sandbox proves valuable, compare Appwrite Pro and Appwrite's PostgreSQL option against keeping Supabase Free plus Cloudflare Workers before spending money.
