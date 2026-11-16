# SuperTech AI backend migration — Cloudflare + Neon

## Decision
Use a free-first, staged replacement backend:
- Neon Free: managed PostgreSQL as the system of record.
- Cloudflare Workers Free: HTTP API and replacement for Supabase Edge Functions.
- Cloudflare R2: object/file storage where a free allowance is available.
- Better Auth (PostgreSQL adapter): registration, login, email verification, password reset and sessions.
- Cloudflare Cron Triggers: scheduled jobs.
- Cloudflare Queues / Durable Objects only where required and after checking current free quotas.

This is a proposed target architecture, not a deployed or verified replacement. Confirm current plan limits and account eligibility before production use.

## Why this target
The current client uses Supabase JS directly for PostgREST queries and Supabase Auth. The project also contains 23 Supabase Edge Functions and scheduled jobs. Appwrite Cloud's free plan function allowance is too small for a direct one-for-one move. Neon preserves PostgreSQL and Cloudflare provides a flexible worker runtime with a free tier.

## Clean-start policy
The owner has approved not migrating old member accounts or historical database records. Existing Supabase remains intact and read-only as a rollback/reference source. New users register again on the replacement.

Do not copy, delete, or overwrite production records. Do not expose secrets in frontend code or Git.

## Required implementation work
1. Inventory all tables, RLS policies, SQL functions, triggers, cron jobs, storage buckets and Edge Function secrets.
2. Rebuild the required schema and constraints in Neon, with explicit role/tenant authorization. Do not rely on client-side checks.
3. Implement Better Auth with verified email, password recovery, secure cookie/session handling and admin bootstrap.
4. Port every required Edge Function and its external integrations to Workers. Current known function names:
   scanner, push, crypto-movers, admin-users, mt5-bridge, finance, ctrader-connect, ctrader-callback, ctrader-disconnect, ctrader-discover-accounts, binance-spot, network, academy-videos, binance-futures, binance-futures-executor, okx-futures, okx-futures-executor, marketing-ai, marketing-image, exchange-market, automation-status, academy-ai, nfc-community.
5. Rebuild scheduled jobs and storage access. Keep exchange credentials encrypted server-side.
6. Replace Supabase client calls behind a typed data-access layer; do not perform an unsafe global text replacement.
7. Preserve existing UI and business rules, including current signal rules: one take-profit target, Bollinger deviation 1.5, stop-loss at -1.0; remove M1 and M5 from user-facing timeframe options.
8. Add automated tests for signup/verification/recovery, admin/member authorization, membership/payment flows, referrals, signal delivery, push notifications, trading integrations, cron and mobile/desktop flows.
9. Deploy to a staging URL, configure secrets through secure secret entry, run smoke tests and obtain owner approval before switching production traffic.

## Release gates
- Build, lint and typecheck pass.
- All 23 function responsibilities are mapped and tested or explicitly retired with owner approval.
- No critical secrets in client bundle or repository.
- Email verification and recovery work end-to-end.
- Member/admin role boundaries verified server-side.
- Trading functions tested in safe/non-live mode first; no live order execution until credentials, safeguards and owner approval are verified.
- Existing production URL remains available until cutover is explicitly approved.

## Current status
Planning branch only. No backend has been deployed, no credentials have been configured, no production environment has been changed, and no new app URL exists yet.
