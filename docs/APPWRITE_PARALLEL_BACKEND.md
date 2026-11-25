# Appwrite parallel backend (Supabase remains primary)

## Operating decision

SuperTech AI will run with both providers during a controlled transition:

- Supabase remains the production source of truth for authentication, memberships, payments, trading signals, order state, existing Edge Functions, and all current workflows.
- Appwrite is introduced as a separately configured secondary backend for a staged proof of capability. It must not receive production writes until its project, collections, permissions, data mapping, and reconciliation process have been verified.
- No existing Supabase client, URL, key, Edge Function, auth flow, email verification, or recovery behavior is changed by this integration.

## Why this is staged

The current application is tightly coupled to Supabase Auth sessions and the Supabase client. Replacing or mirroring authentication immediately could create duplicate identities, divergent sessions, and access-control gaps. Appwrite's database model and permissions also do not map one-to-one to the existing PostgreSQL schema, RLS policies, triggers, and SQL functions.

## Required setup

1. Create an Appwrite Cloud project at https://cloud.appwrite.io/.
2. Add the production app's exact web origin to the Appwrite project's Web platform settings.
3. Record the Appwrite endpoint and project ID. These are public client configuration values.
4. Do not put an Appwrite API key, Supabase service-role key, database password, or other server secret in Vite variables or browser code.
5. Keep the Appwrite project empty until a schema/data mapping and access-control review is complete.

## Rollout phases

### Phase 1 — isolated connection
- Add the official Appwrite Web SDK and lockfile update.
- Add a separately named Appwrite client/config module.
- Add a non-destructive connectivity check.
- Keep Supabase as the only production data/auth provider.

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

This branch is a safe integration preparation. It intentionally does not connect to or write to Appwrite because project credentials/configuration and a verified schema mapping have not yet been supplied. It does not change or deploy the live application.
