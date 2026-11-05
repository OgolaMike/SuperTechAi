# cTrader Gateway

Persistent Node.js 22 service for maintaining member cTrader Open API sessions centrally. Deploy as a long-running container, not a Supabase Edge Function. One service can maintain sessions for many members; members do not each need a VPS.

## Environment

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server secret)
- `CTRADER_CLIENT_ID`
- `CTRADER_CLIENT_SECRET`
- `CTRADER_TOKEN_ENCRYPTION_KEY` (base64-encoded 32-byte key; same key as OAuth callback)
- `GATEWAY_INSTANCE_ID` (optional; use a stable unique value per replica)
- `PORT` (default 8080)
- `POLL_INTERVAL_MS` (default 15000)

Run `npm run check` and `npm start` with Node.js 22+. `GET /health` checks the process only, not broker connectivity. Logs report cTrader environment and account session events. Heartbeats are sent every 10 seconds. The worker renews its per-account database leases every 15 seconds and releases them on graceful shutdown.

## Session and coordination behaviour

- Demo and live account sessions are both supported.
- OAuth grants are decrypted only in the gateway process and refreshed before expiry.
- Open API responses are correlated by `clientMsgId`; ambiguous responses are not assigned to arbitrary requests.
- A worker can renew its own account lease. A different worker can claim that account only after the lease expires.
- Tokens, refresh tokens, and broker credentials must never appear in logs.

## Execution status

This milestone authenticates cTrader account sessions only. It does **not** submit, amend, or close orders. Live-account access is supported, but no live order can be placed by this gateway yet. Automation remains off until an execution engine, member-level opt-in, durable idempotent order dispatch, broker-side SL/TP, risk checks, reconciliation, emergency stop, and monitoring are implemented and tested. Demo testing is useful, but live-account execution is also a required validation milestone with explicit account-owner authorisation and conservative risk settings.
