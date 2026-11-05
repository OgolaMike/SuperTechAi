# cTrader Gateway

Persistent Node.js 22 service for maintaining member cTrader Open API sessions centrally. Deploy as a long-running container, not a Supabase Edge Function.

## Environment

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY (server secret)
- CTRADER_CLIENT_ID
- CTRADER_CLIENT_SECRET
- CTRADER_TOKEN_ENCRYPTION_KEY (base64-encoded 32-byte key; same key as OAuth callback)
- GATEWAY_INSTANCE_ID (optional)
- PORT (default 8080)
- POLL_INTERVAL_MS (default 15000)

Run `npm run check` and `npm start` with Node.js 22+. `GET /health` checks the process only, not broker connectivity. Logs report cTrader environment and account session events. Heartbeats are sent every 10 seconds. Database leases coordinate ownership of each member connection.

## Safety status

This milestone authenticates account sessions only. It does not place, amend, or close orders. Automation and live execution remain disabled. Before order execution, add token invalidation recovery, account reconciliation, symbol mapping, idempotent order intents, risk controls, SL/TP management, emergency stop, monitoring, and extended demo testing.
