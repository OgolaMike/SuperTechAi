# Independent API — first secure connection

The independent Cloudflare Worker lives in `workers/independent-api` and is deliberately separate from the legacy `supertechai-api` Worker.

## Current routes

- `GET /api/health`: returns service identity and explicitly reports that database operations are not ready.
- `GET /api/me`: accepts a short-lived Appwrite JWT as a Bearer token, validates it against the Appwrite Account API, and returns only the verified member identity.
- `GET /api/profile` and `PATCH /api/profile`: member-scoped profile access.
- `GET /api/signals` and `POST /api/signals`: member-scoped signal history with bounded batches and deterministic idempotent row IDs.
- Broker routes are documented separately in `INDEPENDENT_BROKER_MIGRATION.md`. There is no generic Appwrite proxy and no browser-controlled user ID.

## Authentication flow

1. The member signs in through Appwrite Account in the browser.
2. The browser requests a short-lived JWT from Appwrite `POST /account/jwts`.
3. The browser sends that JWT to the independent Worker as a Bearer token.
4. The Worker validates the JWT with Appwrite `GET /account` using `X-Appwrite-JWT`.
5. The Worker returns only the verified identity. Tokens are not logged or persisted.

## Worker configuration

Deploy from `workers/independent-api` with Wrangler. The included `wrangler.toml` names a new Worker, `supertechai-independent-api`; it does not target or overwrite `supertechai-api`.

The Worker currently needs only public Appwrite endpoint/project identifiers and the exact Pages origin. No Appwrite API key is required for identity validation. Any future database API key must be added as a Cloudflare Worker secret, never as a `vars` entry or frontend environment variable.

## Current limits

This is an authenticated API foundation with narrowly scoped profile and signal-history routes, not the completed member backend. The sandbox schema is only partially provisioned and security settings have not been reverified. The proposed signal_records table is not yet created. Do not enable roles, entitlements, payments, referrals, or trading execution until schema/indexes/permissions and negative access tests are complete.

Set `VITE_INDEPENDENT_API_URL` in the Pages project to the deployed independent Worker URL before connecting the browser helper in a live preview. Until then the helper fails closed with a clear configuration error.


## Member profile API

The Worker also exposes a narrowly scoped profile API:

- `GET /api/profile`: resolves the current member from the Appwrite JWT and returns that member's profile. If no row exists, it initializes one using the verified Appwrite user ID.
- `PATCH /api/profile`: allows only a bounded `displayName` update. The Worker ignores client-supplied user IDs, roles, entitlements and onboarding state.
- Rows use the Appwrite user ID as their row ID and receive row-level read/update permissions for that user.

### Required Worker secret

Create an Appwrite API key in the sandbox project with only the database row scopes required by this Worker (`rows.read`, `rows.write` and `rows.delete`), then add it as the Cloudflare Worker secret named `APPWRITE_API_KEY`. Never put it in `wrangler.toml`, Pages variables, source code, or the browser. The key is used only after the Worker validates the caller's Appwrite JWT and derives the row ID itself.

The database and member profile table IDs are configured as non-secret Worker variables. The profile endpoint fails closed with `503 member_data_not_configured` until the secret is configured. It also requires the table columns recorded in `appwrite/schema/member-access.tables.json`; the Appwrite console schema and row-level permissions must be verified before using real member data.

The profile API is not an entitlement or role API. It cannot grant paid access, admin status, payment approval, referrals, withdrawals or trading permissions.

## Signal history persistence

- `GET /api/signals` reads only rows whose `user_id` matches the verified Appwrite account.
- `POST /api/signals` accepts 1–50 validated records per request, enforces the M30–W1 timeframe/granularity map, and derives a deterministic member-specific row ID from the signal key.
- Signal rows are Worker-only (`permissions: []`). The browser retains a device-local cache and syncs to Appwrite when the Worker and table are configured; it falls back locally when the service is unavailable.
- Configure `SIGNAL_RECORDS_TABLE_ID` as a non-secret Worker variable after creating the table exactly as defined in `appwrite/schema/member-access.tables.json`. The table is still proposed and must not be treated as provisioned.
