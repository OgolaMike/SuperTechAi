# Appwrite schema mapping — review before any production data use

## Current state (2026-11-25)

- Appwrite project: `SuperTech Ai`
- Project ID: `6b06de46003dde834eb6`
- Region/endpoint: Frankfurt, `https://fra.cloud.appwrite.io/v1`
- Web platform: `deriv-sma-signal-das-04us.bolt.host` (registered)
- Console access: verified; the Databases page loads.
- Databases/tables: none created.
- Supabase remains the production source of truth.
- No production data has been copied and no dual-writes are enabled.

## Important compatibility boundary

The current application is coupled to Supabase Auth, PostgreSQL, RLS, SQL functions, triggers, and Edge Functions. Appwrite TablesDB is not a drop-in replacement for those facilities. Do not mechanically convert SQL tables into Appwrite tables or assume that matching field names reproduce the existing authorization rules.

The repository's platform transformation baseline reports a large live dataset (including hundreds of thousands of signal records and push events). A full mirror would be expensive, unnecessary for an initial test, and would widen the security and reconciliation surface.

## Domain disposition

| Domain | Existing role in SuperTech AI | Appwrite decision |
|---|---|---|
| Authentication and member identity | Supabase Auth; member access and admin checks | Keep in Supabase. Do not create parallel identities until an explicit identity-linking and recovery design is approved. |
| Trading signals and strategy execution | Signal records, multi-timeframe strategies, alerts, broker/exchange execution | Keep live generation and execution in Supabase/workers. Do not mirror live signals or orders in the first pilot. |
| Scanner and feed operations | Scanner state, candle marks, push delivery state | Keep server-only operational state in current backend. Never expose credentials or push private keys. |
| Push notifications | Browser subscriptions, VAPID private key, event queue | Keep server-only. No Appwrite browser access to subscription secrets or private keys. |
| Membership, payments, referrals, finance | Payment orders, ledger, owner/member balances, withdrawals and entitlements | Exclude from initial Appwrite scope. No payment or financial data replication. |
| Broker/exchange connections | cTrader/MT5 settings, exchange credentials, execution controls | Exclude. Secrets and live execution controls must remain server-side. |
| Governance and owner operations | Proposals, votes, announcements, discussions | Candidate for a later isolated pilot only after role/permission mapping. |
| Academy and educational content | Published lessons, videos, trade reviews | Candidate for a later read-only pilot using non-sensitive published content. |
| Personal AI profile/memory | Member goals and opt-in private memory | Exclude until privacy, consent, retention, export/delete, and per-user access rules are explicitly mapped. |

## Recommended first pilot

Start with a **synthetic connection probe**, not a mirror of production records:

1. Create one dedicated Appwrite database only after the owner approves the proposed database name and test-table schema.
2. Create a single test table with a generated test ID, a fixed test label, and created timestamp. Do not include real user IDs, emails, signals, payment records, broker data, or secrets.
3. Give access only to the test operator during validation; do not grant public read/write permissions.
4. Exercise create/read/delete using a temporary test record only after permissions and server/client boundaries are reviewed. If the pilot is intended to validate browser session auth, verify the actual app-origin session flow separately; a logged-in Console session alone does not prove the deployed website has an Appwrite user session.
5. Delete the synthetic record after validation and document the observed result. Keep the empty test database/table for later isolated work only if explicitly approved.

This probe verifies Appwrite independently without creating a production dual-write path. It does not establish that Supabase identities, RLS policies, SQL functions, or existing application workflows have migrated.

## Required review before any real dataset

For each proposed dataset, record:

- authoritative source and owner;
- exact fields, types, nullability, defaults, and stable identifier;
- data classification and whether it contains personal, financial, or credential data;
- who may read/create/update/delete, including server-only operations;
- equivalent Appwrite permissions and indexes;
- retention, export, deletion, and audit requirements;
- backfill strategy, record-count/sample reconciliation, idempotency, retry handling, and rollback;
- feature flag and explicit production activation approval.

## Non-negotiable safeguards

- Supabase remains authoritative until a separately approved migration decision.
- No production dual-writes, backfills, auth cutover, or destructive changes as part of the connection probe.
- Keep email verification and recovery enabled in the existing Supabase auth flow.
- Never put Appwrite API keys, Supabase service-role keys, database passwords, broker credentials, or VAPID private keys in browser code or Vite environment variables.
- Do not use the Appwrite Console login as proof that a member is authenticated in the deployed app.
- Keep every pilot isolated, reversible, and covered by build/type checks.
