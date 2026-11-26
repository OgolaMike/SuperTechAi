# Independent broker automation migration

This document tracks the broker services being moved from Supabase Edge Functions to the independent Cloudflare Worker + Appwrite platform. The existing Supabase production services are not modified.

## Implemented in the independent Worker

- Binance Spot credential connection route: `POST /api/brokers/binance-spot/connect`; validates a signed Binance account request and requires trading permission with withdrawals disabled.
- Binance Spot status route: `GET /api/brokers/binance-spot/status`; returns connection metadata only, never credential material.
- Binance Spot local disconnect route: `POST /api/brokers/binance-spot/disconnect`; deletes the encrypted local credential row and reminds the member to revoke the key at Binance.
- Binance Spot API key and secret are encrypted with AES-256-GCM and stored in a Worker-only Appwrite row scoped to the authenticated member. Order execution remains disabled.
- Appwrite JWT identity validation (email verification remains required).
- cTrader OAuth start route: `POST /api/brokers/ctrader/connect`.
- cTrader callback route: `GET /api/brokers/ctrader/callback`.
- One-time, hashed OAuth state with a 10-minute expiry.
- Immediate cTrader authorization-code exchange and AES-256-GCM encryption of access/refresh tokens before Appwrite storage.
- Authenticated provider capability endpoint: `GET /api/brokers/capabilities`.
- Authenticated account discovery: `POST /api/brokers/ctrader/discover` uses cTrader's JSON WebSocket protocol on port 5036 to list only accounts granted to the user's token.
- Authenticated account selection: `POST /api/brokers/ctrader/select-account` re-authenticates the selected account session before storing its ID and environment.
- Authenticated token refresh: `POST /api/brokers/ctrader/refresh`; refreshes before expiry, rotates tokens when returned, and re-encrypts them.
- Authenticated local disconnect: `POST /api/brokers/ctrader/disconnect`; deletes the encrypted local grant and explicitly does not claim to revoke provider authorization.
- OAuth state and encrypted grant rows have no member read/update permissions. Reconnect, refresh, account discovery and selection clear any legacy row permissions with an empty permission list.
- Trading execution remains disabled.

### Deriv Options OAuth connection (implemented; execution gated)

The independent Worker now includes a Deriv OAuth 2.0 Authorization Code + PKCE connection flow:

- POST /api/brokers/deriv/connect creates one-time state and encrypted PKCE verifier rows, then redirects to Deriv.
- GET /api/brokers/deriv/callback validates state, exchanges the single-use code server-side, encrypts the access token and stores the member's Deriv Options accounts.
- GET /api/brokers/deriv/status returns connection metadata and available account identifiers only.
- POST /api/brokers/deriv/select-account verifies the selected account belongs to the member's authorised account list.
- POST /api/brokers/deriv/disconnect deletes the encrypted local token copy. The member must also revoke SuperTech AI access from Deriv.
- The Options board includes the secure account-connect journey and account selector.

OAuth requests use only the trade scope. Deriv OAuth access tokens expire and Deriv does not issue refresh tokens; users must re-authorise after expiry. The token exchange is server-side and uses PKCE. The browser never receives the token.

Required Worker vars:
- DERIV_CLIENT_ID
- DERIV_REDIRECT_URI (exact Worker callback URL: https://<worker-host>/api/brokers/deriv/callback)
- DERIV_OAUTH_STATES_TABLE_ID
- DERIV_GRANTS_TABLE_ID

Required Worker secret:
- Existing BROKER_TOKEN_ENCRYPTION_KEY (base64 encoding of exactly 32 cryptographically random bytes).

Register the exact callback URL in the Deriv OAuth application. The Deriv application must permit the trade scope. Configure the Appwrite TablesDB tables below before enabling the Worker routes.

## Required Appwrite tables

Create these TablesDB tables in database `supertech_ai_sandbox`. Add the columns exactly as listed; use string columns for timestamps and encrypted values. Set row security on and use server API-key access for writes. Never grant a client permission to read token ciphertext.

### `binance_spot_credentials`
| Column | Type | Required |
|---|---|---|
| user_id | string(36) | yes |
| encrypted_api_key | string(4096) | yes |
| encrypted_api_secret | string(4096) | yes |
| api_key_last4 | string(4) | yes |
| status | string(32) | yes |
| verified_at | string(40) | yes |
| can_trade | boolean | yes |
| can_withdraw | boolean | yes |

Use one row per member with row security enabled. Grant no client read, write, or delete permissions; only the Worker API key may access credential rows.

### deriv_oauth_states
| Column | Type | Required |
|---|---|---|
| state_hash | string(64) | yes |
| user_id | string(36) | yes |
| encrypted_code_verifier | string(4096) | yes |
| redirect_path | string(512) | yes |
| expires_at | string(40) | yes |

### deriv_account_grants
| Column | Type | Required |
|---|---|---|
| user_id | string(36) | yes |
| encrypted_access_token | string(4096) | yes |
| token_expires_at | string(40) | yes |
| accounts_json | string(30000) | no |
| selected_account_id | string(64) | no |
| status | string(32) | yes |

Use unique indexes on state_hash and user_id respectively. Enable row security and grant no client read, write, or delete permissions. Only the Worker API key may access these rows. Use deterministic row IDs derived from the Appwrite user ID for account grants.

### `ctrader_oauth_states`
| Column | Type | Required |
|---|---|---|
| state_hash | string(64) | yes |
| user_id | string(36) | yes |
| redirect_path | string(512) | yes |
| expires_at | string(40) | yes |
| consumed_at | string(40) | no |

### `ctrader_oauth_grants`
| Column | Type | Required |
|---|---|---|
| user_id | string(36) | yes |
| encrypted_access_token | string(4096) | yes |
| encrypted_refresh_token | string(4096) | yes |
| token_expires_at | string(40) | yes |
| granted_scopes | string(128) | yes |
| status | string(64) | yes |
| accounts_json | string(30000) | no |
| accounts_discovered_at | string(40) | no |
| permission_scope | string(32) | no |
| selected_account_id | string(32) | no |
| selected_account_is_live | boolean | no |

Use a unique index on `user_id` for grants and on `state_hash` for states. Grant rows must only be readable/writable by the Worker API key. The callback uses a deterministic row ID per member, so a member has one active grant row.

## Cloudflare Worker configuration

Set these non-secret Worker vars after the tables exist:

- `BINANCE_SPOT_CREDENTIALS_TABLE_ID`\n- `CTRADER_OAUTH_STATES_TABLE_ID`
- `CTRADER_GRANTS_TABLE_ID`
- `CTRADER_CLIENT_ID`
- `CTRADER_REDIRECT_URI` (must exactly match the cTrader application callback URL)

Set these as Worker secrets, never as Pages variables:

- `CTRADER_CLIENT_SECRET`
- `BROKER_TOKEN_ENCRYPTION_KEY`: base64 encoding of exactly 32 cryptographically random bytes.

The Appwrite server API key must have only the TablesDB `rows.read`, `rows.write` and `rows.delete` permissions needed for the configured tables and existing profile rows. Keep it in the Worker secret `APPWRITE_API_KEY`.

## Remaining migration work (not represented as complete)

The following original Supabase functions still require provider-specific ports and Appwrite persistence before they can be enabled:

- cTrader provider-side token revocation, cloud reconciliation, risk preflight, order placement, position/order reconciliation and callbacks.
- MT5 pairing, worker heartbeat/authentication, signal-intent delivery, order/position reconciliation and worker revocation.
- Binance Spot settings, order intents, execution, fills and reconciliation (credential verification and encrypted key storage are now implemented; order execution remains disabled).
- Binance USDT-M Futures credential verification, risk sizing, idempotent order execution, protective orders and reconciliation.
- OKX Futures credential verification, settings, signal intents, risk sizing, attached TP/SL, uncertain-order recovery and reconciliation.
- Deriv Options proposal pricing, purchase, authenticated WebSocket OTP/session handling, open-contract monitoring, idempotent order intents, demo validation, risk checks and settlement reconciliation. Account OAuth and account selection are implemented, but contract execution remains disabled.

## Safety gates

- No broker secrets or tokens in the browser bundle, URL, logs, or client-readable Appwrite rows.
- No live order execution is enabled by this migration.
- A broker adapter must verify permissions and account identity before storing a connection.
- Every order must have an idempotency key, fresh signal validation, account-level risk checks, and exchange-side protective-order confirmation.
- An ambiguous network outcome must be reconciled by client order ID; never blindly resubmit.
- Demo/sandbox tests and an independent security review are required before live execution or paid member access.
