# SuperTech AI — Cloudflare backend foundation

This is the isolated replacement backend foundation. It does not replace or modify the live Supabase project.

## Current capabilities
- Cloudflare Worker entry point and environment separation (staging / production).
- Health endpoint with a real Neon PostgreSQL connectivity check.
- CORS restricted to the configured app origin.
- Unmigrated application API routes fail closed with HTTP 501; they do not silently fall back to insecure placeholder behavior.

## Setup after creating free-tier accounts
1. Create a Neon PostgreSQL project and copy its pooled connection string.
2. Create a Cloudflare account and install Wrangler locally.
3. From this directory, install dependencies with `npm install`.
4. Set staging secrets:
   `npx wrangler secret put DATABASE_URL --env staging`
5. Deploy staging:
   `npm run deploy:staging`
6. Verify the worker health endpoint reports `database: connected`.

Do not put database credentials, auth secrets, exchange API keys, or payment secrets in source files or `wrangler.toml`.

## Important
The app is not ready for cutover. Authentication, email verification/recovery, authorization, app data APIs, the 23 existing Edge Function responsibilities, scheduled jobs, storage, and external integrations must be migrated and tested before changing the frontend API endpoint.
