# Independent broker automation migration

This document tracks the broker services being moved from Supabase Edge Functions to the independent Cloudflare Worker + Appwrite platform. The existing Supabase production services are not modified.

## Implemented in the independent Worker

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

## Required Appwrite tables

Create these TablesDB tables in database `supertech_ai_sandbox`. Add the columns exactly as listed; use string columns for timestamps and encrypted values. Set row security on and use server API-key access for writes. Never grant a client permission to read token ciphertext.

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

Use a unique index on `user_id` for grants and on `state_hash` for states. Grant rows must only be readable/writable by the Worker API key. The callback uses a deterministic row ID per member, so a member has one active grant row.

## Cloudflare Worker configuration

Set these non-secret Worker vars after the tables exist:

- `CTRADER_OAUTH_STATES_TABLE_ID`
- `CTRADER_GRANTS_TABLE_ID`
- `CTRADER_CLIENT_ID`
- `CTRADER_REDIRECT_URI` (must exactly match the cTrader application callback URL)

Set these as Worker secrets, never as Pages variables:

- `CTRADER_CLIENT_SECRET`
- `BROKER_TOKEN_ENCRYPTION_KEY`: base64 encoding of exactly 32 cryptographically random bytes.

The Appwrite server API key must have only the TablesDB permissions needed for the two tables and existing profile rows. Keep it in the Worker secret `APPWRITE_API_KEY`.

## Remaining migration work (not represented as complete)

The following original Supabase functions still require provider-specific ports and Appwrite persistence before they can be enabled:

- cTrader provider-side token revocation, cloud reconciliation, risk preflight, order placement, position/order reconciliation and callbacks.
- MT5 pairing, worker heartbeat/authentication, signal-intent delivery, order/position reconciliation and worker revocation.
- Binance Spot credential verification, encrypted key vault, settings, order intents, execution, fills and reconciliation.
- Binance USDT-M Futures credential verification, risk sizing, idempotent order execution, protective orders and reconciliation.
- OKX Futures credential verification, settings, signal intents, risk sizing, attached TP/SL, uncertain-order recovery and reconciliation.
- Deriv Options account authorization, contract proposal, purchase, open-contract monitoring and settlement.

## Safety gates

- No broker secrets or tokens in the browser bundle, URL, logs, or client-readable Appwrite rows.
- No live order execution is enabled by this migration.
- A broker adapter must verify permissions and account identity before storing a connection.
- Every order must have an idempotency key, fresh signal validation, account-level risk checks, and exchange-side protective-order confirmation.
- An ambiguous network outcome must be reconciled by client order ID; never blindly resubmit.
- Demo/sandbox tests and an independent security review are required before live execution or paid member access.
