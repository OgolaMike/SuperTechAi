# Independent Appwrite platform plan

## Operating model

SuperTech AI will be operated as two separate deployments while the owner compares them.

- **Legacy deployment:** current production app and Supabase project. No auth, database, function, storage, or deployment changes are made by this work.
- **Appwrite deployment:** a separately configured copy of the same product. It must authenticate its own members and use Appwrite-backed application data and services. It must not silently fall back to Supabase.
- Both deployments keep the same product experience, strategy calculations, signal rules, navigation, membership tiers, referral rules, admin workflows, and brand. Differences should be infrastructure-only unless the owner approves otherwise.

## Important architecture finding

The current application is not merely using Supabase for login. Supabase is embedded throughout the product:

- Auth and member access: `src/hooks/useAuthSession.ts`, `src/lib/auth.ts`, and `src/lib/sessionContext.ts`.
- Direct database access across member preferences, governance, finance, referrals, academy, automation settings, marketing, AI profiles, records, and other areas.
- Edge Functions for finance, admin operations, network/referrals, crypto movers, exchange proxies, AI tools, cTrader, Binance, OKX, MT5, notifications, and more.
- Storage for Academy recordings and other uploaded media.
- Server-side jobs and executors that use Supabase service credentials.

Therefore changing only the login form would leave the new platform dependent on Supabase and would not meet the owner's requirement. The Appwrite deployment must have a provider-specific data/service layer and Appwrite Functions or another Appwrite-compatible backend for protected operations.

## Free hosting for the independent deployment

The independent web frontend is intended for **Cloudflare Pages Free**, not Bolt.new. The existing Bolt deployment remains untouched.

- Framework: Vite + React + TypeScript (already used by this repository).
- Build command: `npm run build`.
- Build output directory: `dist`.
- Production branch: `feat/appwrite-independent-platform-foundation` during validation; use a dedicated release branch after review.
- SPA routing: `public/_redirects` routes application paths back to `index.html`.
- Basic response headers: `public/_headers`.
- Public build-time configuration: `VITE_APPWRITE_ENDPOINT` and `VITE_APPWRITE_PROJECT_ID`.
- Do not add Appwrite API keys, service-role credentials, exchange secrets, or private keys to frontend environment variables.

Cloudflare Pages is only the frontend host in this design. Appwrite remains the identity/data platform. Any protected server-side feature must be implemented with Appwrite Functions or another secured backend, not placed in the browser bundle.

Cloudflare Pages Free currently documents 500 builds per month, one concurrent build, and custom-domain support. Confirm current account quotas before opening the new site to members.

## Appwrite foundation

- Endpoint: `https://fra.cloud.appwrite.io/v1`
- Project ID: `6b06de46003dde834eb6`
- Database sandbox: `supertech_ai_sandbox` (`6b06e4d900325c304d98`)
- Existing connection probe table: `connection_probe` (`6b06e4ec000a9c8a0f94`)
- Browser config is public; never put Appwrite API keys, Supabase service-role keys, exchange secrets, or encryption keys in Vite variables.

The Appwrite client now has account lifecycle methods for account creation, email/password sessions, current-account lookup, sign-out, email verification, and password recovery. These methods are isolated in `src/lib/appwrite.ts` and do not import or fall back to Supabase.

## Migration rules

1. Keep the Appwrite deployment on its own branch and deployment URL.
2. Never write Appwrite user IDs into legacy Supabase member rows as if they were the same identity.
3. Preserve paid access, referral attribution, ownership/admin roles, payment history, and financial ledgers through a reviewed migration or verified account-relink process. Do not auto-approve every new account.
4. Do not migrate exchange API keys, passwords, wallet secrets, or other credentials as plain documents. Rebuild encrypted credential storage and server-side execution boundaries first.
5. Keep email verification and password recovery enabled.
6. Move one domain at a time, with tests and a rollback path. The new deployment must not make hidden requests to Supabase for a migrated domain.
7. Keep both deployments available until the owner chooses based on feature parity, reliability, security, and cost.

## Work sequence

- **Foundation:** Appwrite account API and independent deployment configuration.
- **Identity/access:** Appwrite user profiles, verified-email gate, roles, membership approval and account recovery; update the app session contract without changing the legacy build.
- **Core data:** migrate member preferences, signal history, watchlists, referrals, finance/membership and admin workflows with explicit permissions and reconciliation.
- **Services:** replace each required Supabase Edge Function with Appwrite Functions or a separately hosted secured service; move file storage and notifications.
- **Trading/automation:** port authenticated integrations and server-side executors only after secret management, authorization, idempotency, and emergency-stop behavior are validated.
- **Parity validation:** test the same user journeys and strategy outputs on both deployments before public use.

## Current branch status

This branch adds isolated Appwrite account API methods only. It does not yet switch the app's AuthGate, migrate member permissions/data, replace Supabase Edge Functions or storage, or produce a complete Appwrite-only runtime. It is not ready to deploy as the independent member platform until those steps pass build, security, and end-to-end tests.
