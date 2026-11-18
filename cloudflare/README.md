# SuperTech AI — Cloudflare shadow environment

This folder is intentionally isolated from the live Bolt + Supabase application.

## Current safety rules

- Never change production Supabase settings or records from this environment.
- Never point the live frontend at this Worker until a separately approved cutover.
- Do not enable broker execution, payment processing, live push dispatch, or scheduled production scanning in shadow mode.
- Keep Supabase as the identity provider during the first shadow phase. The D1 `app_users` table is a non-secret identity mirror only; do not copy password hashes, recovery tokens, API keys, OAuth grants, VAPID private keys, or other credentials.
- Use synthetic users for initial authorization and API tests.

## Setup after Cloudflare account access

1. Install the current Wrangler CLI locally.
2. Authenticate with the user's Cloudflare account.
3. Create a D1 database named `supertechai-shadow`.
4. Replace the placeholder `database_id` in `worker/wrangler.toml`.
5. Apply migrations locally first, then remotely:
   - `npx wrangler d1 migrations apply supertechai-shadow --local`
   - `npx wrangler d1 migrations apply supertechai-shadow --remote`
6. Deploy only the shadow Worker using `npx wrangler deploy --config worker/wrangler.toml`.
7. Verify `/health` before any data import.

## Data copy

The initial D1 schema is a structural translation of the 74 live public tables. It is not a data dump and is not yet production-complete: indexes, triggers, views, Postgres functions/RPCs, RLS policies, auth, storage objects, and all function dependencies still require explicit translation and parity tests.

Export rows from Supabase in bounded, ordered batches. Transform PostgreSQL values into SQLite-safe values, preserve UUIDs and stable keys, preserve financial decimals as canonical decimal strings, and load parent tables before children. Compare counts and deterministic hashes after import.

Historical data is large: the connected Supabase database measured 318 MB; `signal_records` was 106 MB / 356,303 rows and `push_events` was 177 MB / 180,949 rows. Confirm the actual transformed D1 size before deciding whether the entire history fits the Free 500 MB per-database limit. Consider retaining a compact recent window plus archival files in R2 if required, but do not omit records without explicit owner approval.

## Authentication during dual-run

The first D1 shadow release should validate the existing Supabase access token at the Worker boundary and map its immutable Supabase user ID to `app_users`. Keep email verification and recovery in Supabase. Do not build a second password store or assume that copying `auth.users` rows recreates working sessions. A later identity-provider migration is a separate project.

## Current scope

- Worker: health endpoint only; no user data API yet.
- D1: baseline schema migration only; no production data imported.
- Pages: not connected or deployed.
- Production: unchanged.
