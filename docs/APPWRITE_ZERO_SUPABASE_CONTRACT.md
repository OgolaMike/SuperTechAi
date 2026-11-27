# Independent SuperTech AI — zero-Supabase architecture contract

**Status:** Binding architecture for the Appwrite/Cloudflare deployment  
**Updated:** 2026-11-26  
**Legacy protection:** The existing Bolt/Supabase deployment is out of scope and must not be modified.

## Non-negotiable boundary

The independent deployment must have **zero runtime dependency on Supabase**. This prohibits:

- Supabase Auth or session cookies.
- Supabase PostgREST/database URLs or Supabase client calls.
- Supabase Storage, Realtime, Edge Functions, cron jobs, or webhooks.
- Supabase service-role keys, anon keys, or other Supabase credentials in frontend or backend configuration.
- Silent fallback, dual-write, shadow-sync, or proxying through the legacy Supabase project.

A shared source repository does not make the deployments independent. The independent entrypoint must load only Appwrite/Cloudflare adapters and provider-neutral business logic. Legacy modules may remain in the repository for the original deployment, but they must not be imported into the independent app bundle.

## Target stack

| Responsibility | Independent platform |
|---|---|
| Web hosting and preview deployments | Cloudflare Pages |
| Secured API and scheduled work | Cloudflare Workers |
| Identity, email verification, password recovery | Appwrite Account |
| Application records and access permissions | Appwrite Database |
| User uploads and media | Appwrite Storage |
| Server-side secrets | Cloudflare Worker secrets / Appwrite Function secrets |
| Market data | Direct broker/exchange public feeds through a controlled server adapter |
| Trading execution | Dedicated secured Worker/service, only after credential vault and risk controls are ready |

The browser may contain only public Appwrite endpoint/project identifiers. Never ship Appwrite API keys, broker keys, wallet secrets, encryption keys, or signing credentials to the browser.

## Proposed Appwrite data domains

These are **schema proposals**, not claims that collections already exist. Create them in the sandbox only after the access model and indexes are reviewed.

### Identity and access
- `member_profiles`: one document per Appwrite user; display name, contact preferences, onboarding state.
- `member_roles`: role grants managed only by trusted server functions; never trust a role supplied by the browser.
- `membership_entitlements`: current access state, tier, effective dates, approval state and source payment reference.
- `membership_events`: append-only audit trail for activation, expiry, suspension and admin changes.

### Commercial and referral records
- `payment_records`: payment reference, asset/network, amount, status, timestamps and reviewer; never store wallet seed phrases or private keys.
- `referral_relationships`: referrer user ID, referred user ID, attribution timestamp and validation state.
- `commission_ledger`: immutable credit/debit entries with idempotency key and reconciliation metadata.
- `withdrawal_requests`: request state and approval trail; execution must be server-authorized.

### Trading intelligence
- `watchlists`: member-owned symbol preferences.
- `strategy_catalog`: independently defined strategies and versioned configuration; strategies remain separate, not chart overlays.
- `strategy_evaluations`: one evaluation per strategy/symbol/timeframe/candle close, with direction, score, evidence and version.
- `confluence_snapshots`: agreement summary derived from independent strategy outputs; preserve each strategy's individual result.
- `trading_signals`: published signal, status, entry/targets/stop and originating confluence snapshot.
- `signal_events`: append-only lifecycle events such as created, updated, target reached, stopped or invalidated.
- `trade_plans`: member-visible plan/order intent and execution status; broker execution credentials are not stored here.

### Member experience and operations
- `user_preferences`: theme, alert settings, display choices and timeframe preferences.
- `notifications`: per-member delivery state and read status.
- `audit_events`: append-only security-sensitive administrative actions.
- `broker_connections`: non-secret connection metadata only; encrypted credentials live in a server-only vault or secret store.
- `academy_content` and `academy_progress`: content metadata and member progress; uploaded media belongs in Appwrite Storage.

## Access-control rules

1. Every member-owned document is scoped to its Appwrite user ID and granted only to that user unless a trusted function deliberately shares it.
2. Public strategy metadata may be readable by authenticated members, but writes are server-only.
3. Roles, entitlements, payment approvals, commissions, withdrawals and audit records are server-managed.
4. Never accept `userId`, role, entitlement, commission amount, or payment status from a browser request without validating it against the authenticated Appwrite session and authoritative server-side rules.
5. Use append-only event records for financial and signal lifecycle history. Corrections are new events, not silent edits.
6. Use idempotency keys for payments, commissions, signal publication and broker execution.
7. Broker/exchange credentials must be encrypted at rest, decrypted only inside the authorized server runtime, and excluded from logs and client responses.

## Migration sequence

### Stage 1 — isolate the independent application
- Keep the Appwrite auth gate and its verified-email/password-recovery behavior.
- Add a build-time/static guard that fails if the independent entrypoint imports Supabase modules or Supabase-dependent legacy routes.
- Confirm the preview domain is registered as an Appwrite Web platform.
- Run build, lint, typecheck and browser account lifecycle tests.

### Stage 2 — create the data foundation
- Review the proposed collection schemas, indexes, document ownership and server-only write rules.
- Create Appwrite collections and indexes in the sandbox, not the legacy project.
- Add a small synthetic test fixture; do not copy live member, financial, or broker data.

### Stage 3 — member access and business records
- Implement profiles, roles, entitlements, membership events and admin approval through trusted server functions.
- Preserve email verification and password recovery.
- Test member/admin boundaries using separate test accounts.

### Stage 4 — trading intelligence
- Port each strategy as an independent evaluator.
- Persist strategy outputs separately, then calculate confluence from those outputs.
- Adopt the owner's current 13-timeframe standard: M1, M5, M15, M30, H1, H2, H3, H4, H6, H8, H12, D1 and W1. M1/M5/M15 are confirmation layers; M30 remains the lowest strategy execution timeframe.
- Verify deterministic results against known fixtures before live market feeds.

### Stage 5 — notifications, referrals, academy and finance
- Move each domain to Appwrite collections/storage and secured Worker endpoints.
- Reconcile ledgers and referral attribution using test fixtures before any real-money workflow is enabled.

### Stage 6 — broker integrations and automation
- Implement credential vaulting, signed requests, authorization, idempotency, rate limits, audit logs and emergency stop first.
- Keep live execution disabled until an explicit end-to-end safety test is passed.
- Never expose broker secrets to the frontend.

### Stage 7 — parity and release
- Compare user journeys and strategy outputs with the legacy product using test accounts and synthetic data.
- Confirm no requests from the independent deployment reach any Supabase hostname.
- Keep the two deployments separate until the owner chooses whether to continue both.

## Completion checklist

- [ ] Independent bundle has no Supabase imports or Supabase network requests.
- [ ] Appwrite email verification and password recovery pass end-to-end tests.
- [ ] Appwrite collections, indexes and permissions are provisioned and tested.
- [ ] Member/admin role boundaries pass negative tests.
- [ ] Trading strategies persist independently and confluence is derived from them.
- [ ] All 13 analysis timeframes are enforced end-to-end; M1/M5/M15 remain confirmation-only for strategy execution.
- [ ] Notifications, referrals, finance and academy pass their own parity tests.
- [ ] Broker credentials are server-only and execution safety tests pass.
- [ ] Cloudflare deployment uses only independent-platform environment variables and secrets.
- [ ] Legacy Bolt/Supabase deployment remains unchanged.

## Current reality

The independent Appwrite sandbox has four confirmed tables from the latest direct database inventory: `connection_probe`, `member_profiles`, `member_roles`, and `membership_entitlements`. `membership_events` was not present in that inventory. The subsequent browser provisioning run was interrupted by its execution budget; it did not finish the schema or perform a final verification.

- `connection_probe` — ID `6b06e4ec000a9c8a0f94`; was not modified.
- `member_profiles` — ID `6b074d7f001787b0d0c8`; latest run added nullable `created_at` and `updated_at`, and reported `user_id` updated to required. Existing `display_name` remains optional; `onboarding_status` is still nullable. No index creation was completed.
- `member_roles` — ID `6b074e04002c1011d8df`; latest run added required `user_id`; creation status was reported as Available/Processing. `role`, `granted_by`, and `created_at` remain pending. No index creation was completed.
- `membership_entitlements` — ID `6b074fbd000bd6277c02`; no schema changes were completed in the latest run.
- `membership_events` — creation was not completed; confirm the table list before any creation attempt.

The preceding direct inspection found no indexes and no configured permissions on the four existing tables. It found RLS ON for `connection_probe`, `member_profiles`, and `member_roles`, but OFF for `membership_entitlements`. The latest run did not re-verify those security settings. Treat permissions and current RLS as requiring reinspection. Do not grant client permissions or enable member-data writes until all columns, indexes, and access rules are verified.

The machine-readable provisioning record is `appwrite/schema/member-access.tables.json`. It records the partial state separately from the intended schema. No member, payment, referral or broker records have been created or copied. Appwrite account adapter and independent auth gate exist in the feature branch; browser account lifecycle is not yet end-to-end verified. The independent platform is still a foundation, not full feature parity.
