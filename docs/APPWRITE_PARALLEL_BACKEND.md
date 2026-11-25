# Appwrite parallel backend (Supabase remains primary)

## Operating decision

SuperTech AI will run with both providers during a controlled transition:

- Supabase remains the production source of truth for authentication, memberships, payments, trading signals, order state, existing Edge Functions, and all current workflows.
- Appwrite is introduced as a separately configured secondary backend for a staged proof of capability. It must not receive production writes until its project, collections, permissions, data mapping, and reconciliation process have been verified.
- No existing Supabase client, URL, key, Edge Function, auth flow, email verification, or recovery behavior is changed by this integration.

## Why this is staged

The current application is tightly coupled to Supabase Auth sessions and the Supabase client. Replacing or mirroring authentication immediately could create duplicate identities, divergent sessions, and access-control gaps. Appwrite's database model and permissions also do not map one-to-one to the existing PostgreSQL schema, RLS policies, triggers, and SQL functions.

## Configured Appwrite project

- Endpoint: `https://fra.cloud.appwrite.io/v1`
- Project ID: `6b06de46003dde834eb6`
- Client module: `src/lib/appwrite.ts` (isolated Appwrite REST client; no new npm dependency)
- Optional environment template: `.env.appwrite.example`

The endpoint and project ID are public browser configuration, not secrets. The client reads `VITE_APPWRITE_ENDPOINT` and `VITE_APPWRITE_PROJECT_ID`, with the supplied project values as safe defaults.

## Required console setup

1. In the Appwrite project, add a Web platform for `deriv-sma-signal-das-04us.bolt.host`.
2. Also add `localhost` for local development if needed.
3. Confirm the project region is Frankfurt (`fra`).
4. Do not create production collections or copy live data yet; schema mapping and access-control review must happen first.
5. Do not put an Appwrite API key, Supabase service-role key, database password, or other server secret in Vite variables or browser code.

## Rollout phases

### Phase 1 — isolated connection (client configured)
- Added the official Appwrite Web SDK dependency (`appwrite` 29.3.1).
- Added a separately named Appwrite client/config module.
- Supabase remains the only production data/auth provider.
- The Appwrite project still needs its Web platform hostname configured in the Console before browser requests can succeed.

### Phase 2 — schema and security
- Map selected non-financial read-only data first (for example, public strategy metadata).
- Define Appwrite collections, indexes, document IDs, user permissions, and server-side write boundaries.
- Do not copy secrets, payment credentials, exchange API keys, or private trading account data.

### Phase 3 — shadow verification
- Backfill a test copy, compare record counts and sampled values, and verify access rules.
- Use server-side idempotent writes for any approved dual-write dataset.
- Log and reconcile failures; never silently treat one backend as updated when the other failed.

### Phase 4 — controlled activation
- Enable one feature at a time behind an explicit feature flag.
- Require owner approval and tested rollback before any production cutover.
- Supabase remains authoritative until a separately approved migration decision.

## Current status

The Appwrite REST client is now configured on this branch using the project endpoint and ID supplied by the owner. It exposes read-only account, database-list, and table-row helpers for the initial verification phase. No Appwrite API key is required for this public client initialization. No collections, auth flows, production writes, Supabase settings, or live deployment have been changed. The Appwrite Web platform hostname must be added in the Console, then the branch must pass build/type checks before any read/write feature is introduced.
