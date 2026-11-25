# Appwrite parallel backend (Supabase remains primary)

## Operating decision

SuperTech AI will run with both providers during a controlled transition:

- Supabase remains the production source of truth for authentication, memberships, payments, trading signals, order state, existing Edge Functions, and all current workflows.
- Appwrite is introduced as a separately configured secondary backend for a staged proof of capability. It must not receive production writes until its project, tables, permissions, data mapping, and reconciliation process have been verified.
- No existing Supabase client, URL, key, Edge Function, auth flow, email verification, or recovery behavior is changed by this integration.

## Why this is staged

The current application is tightly coupled to Supabase Auth sessions and the Supabase client. Replacing or mirroring authentication immediately could create duplicate identities, divergent sessions, and access-control gaps. Appwrite's database model and permissions also do not map one-to-one to the existing PostgreSQL schema, RLS policies, triggers, and SQL functions.

## Configured Appwrite project

- Endpoint: `https://fra.cloud.appwrite.io/v1`
- Project ID: `6b06de46003dde834eb6`
- Client module: `src/lib/appwrite.ts` (isolated native REST client; no new npm dependency)
- Optional environment template: `.env.appwrite.example`
- Web platform: `deriv-sma-signal-das-04us.bolt.host` (registered and verified in the Console)

The endpoint and project ID are public browser configuration, not secrets. The client reads `VITE_APPWRITE_ENDPOINT` and `VITE_APPWRITE_PROJECT_ID`, with the supplied project values as safe defaults. Browser requests still require an Appwrite session appropriate to the app origin; a Console login does not automatically authenticate a member in the deployed app.

## Current Console verification

- Authenticated Appwrite Console access was confirmed for the supplied project.
- The Databases page loaded successfully.
- The project currently contains zero databases and zero tables.
- No database, table, production data, API key, or permission was created or changed during this inspection.

## Rollout phases

### Phase 1 — isolated client and project setup
- Added an isolated native REST client with read-only helpers for account, database listing, and TablesDB row listing.
- Registered the deployed website hostname as an Appwrite Web platform.
- Kept Supabase as the only production data/auth provider.
- Build, typecheck, lint, and GitHub execution checks passed for the client-preparation commit. The schema-mapping documentation commit is a subsequent change and must complete its own checks.

### Phase 2 — schema and security review
- Map candidate datasets and explicitly exclude finance, payment, credentials, broker execution, push secrets, and private member memory from the first pilot.
- Define Appwrite tables, indexes, document IDs, permissions, and server-side write boundaries.
- See `docs/APPWRITE_SCHEMA_MAPPING.md` for the current domain disposition and proposed synthetic connection probe.
- Do not copy production data until the mapping and access-control review is approved.

### Phase 3 — isolated verification
- Start with synthetic test data only, not production records.
- Verify app-origin authentication separately from Console authentication.
- If a later test copy is approved, compare record counts and sampled values and verify access rules.
- Use server-side idempotent writes for any approved dual-write dataset.
- Log and reconcile failures; never silently treat one backend as updated when the other failed.

### Phase 4 — controlled activation
- Enable one feature at a time behind an explicit feature flag.
- Require owner approval and tested rollback before any production cutover.
- Supabase remains authoritative until a separately approved migration decision.

## Security boundaries

- Do not put an Appwrite API key, Supabase service-role key, database password, broker/exchange credential, VAPID private key, or other server secret in Vite variables or browser code.
- Do not use Appwrite Console login as proof that an app member is authenticated in the deployed website.
- Keep email verification and recovery enabled in the existing Supabase auth flow.
- Do not enable production dual-writes or migrate data as part of the initial connection test.
