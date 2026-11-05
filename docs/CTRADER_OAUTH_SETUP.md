# cTrader OAuth and account-discovery setup

## Redirect URI
Register this exact callback URL in the cTrader Open API application:

`https://jtfsqhewotinvlrcadwq.supabase.co/functions/v1/ctrader-callback`

## Supabase Edge Function secrets
Set these in Supabase Dashboard → Edge Functions → Secrets. Never commit values to GitHub or send them in chat.

- `CTRADER_CLIENT_ID` — cTrader Open API application client ID.
- `CTRADER_CLIENT_SECRET` — cTrader Open API application client secret.
- `CTRADER_REDIRECT_URI` — exact callback URL above.
- `CTRADER_TOKEN_ENCRYPTION_KEY` — Base64 encoding of 32 cryptographically random bytes. Keep a secure backup.

Supabase supplies its standard URL, anon key and service-role key to Edge Functions.

## Deployed endpoints
- `POST /functions/v1/ctrader-connect` — signed-in member only; creates a ten-minute, single-use OAuth state and returns the cTrader authorisation URL.
- `GET /functions/v1/ctrader-callback` — public OAuth callback; consumes state, exchanges the one-minute authorisation code and stores AES-256-GCM encrypted tokens.
- `POST /functions/v1/ctrader-discover-accounts` — signed-in member only; decrypts that member's pending grant, authenticates the application against the cTrader demo and live JSON WebSocket endpoints, requests the account list, authenticates each account and creates member-owned account records. Automation and live execution remain OFF.
- `POST /functions/v1/ctrader-disconnect` — signed-in member only; revokes stored grants. The execution gateway must also pause and close its sessions when implemented.

## cTrader protocol notes
Open API JSON uses WebSocket port 5036. Demo and live endpoints are separate: `wss://demo.ctraderapi.com:5036` and `wss://live.ctraderapi.com:5036`. Application authentication is payload type 2100, account-list request 2149, and account authentication request 2102. Account IDs are authenticated only on the environment indicated by cTrader's `isLive` flag.

## Current boundary
Account discovery is deployed but cannot complete until the cTrader application credentials and encryption key are configured and a member completes OAuth. This endpoint performs account discovery and session authentication only. It does not yet create persistent streaming sessions or place orders.

## Rollout safety
- OAuth requests the `trading` scope for the intended automated trading permission.
- Automation, unattended execution and live execution default to OFF.
- Test using demo accounts first.
- Do not enable live trading until persistent sessions, token refresh, reconciliation, idempotent order execution, risk checks and emergency pause are implemented and tested.
