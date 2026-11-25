# Independent API — first secure connection

The independent Cloudflare Worker lives in `workers/independent-api` and is deliberately separate from the legacy `supertechai-api` Worker.

## Current routes

- `GET /api/health`: returns service identity and explicitly reports that database operations are not ready.
- `GET /api/me`: accepts a short-lived Appwrite JWT as a Bearer token, validates it against the Appwrite Account API, and returns only the verified member identity.
- All other routes return `404`. There is no generic Appwrite proxy and no browser-controlled user ID.

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

This is an authenticated API foundation, not the completed member backend. It does not read or write Appwrite database tables yet. The sandbox schema is only partially provisioned and security settings have not been reverified. Do not enable profile writes, roles, entitlements, payments, referrals, or trading execution until schema/indexes/permissions and negative access tests are complete.

Set `VITE_INDEPENDENT_API_URL` in the Pages project to the deployed independent Worker URL before connecting the browser helper in a live preview. Until then the helper fails closed with a clear configuration error.
