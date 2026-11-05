# cTrader OAuth deployment checklist

## Redirect URI
Register this exact callback URL in the cTrader Open API application after it is created and approved:

`https://jtfsqhewotinvlrcadwq.supabase.co/functions/v1/ctrader-callback`

The first redirect URI in the cTrader portal is reserved for its Playground. Do not use it for SuperTech AI.

## Supabase Edge Function secrets
Set these in Supabase Dashboard → Edge Functions → Secrets. Never commit values to GitHub or send them in chat.

- `CTRADER_CLIENT_ID` — cTrader Open API application client ID.
- `CTRADER_CLIENT_SECRET` — cTrader Open API application client secret.
- `CTRADER_REDIRECT_URI` — the exact callback URL above.
- `CTRADER_TOKEN_ENCRYPTION_KEY` — base64 encoding of 32 cryptographically random bytes. Keep a secure backup; losing it makes stored grants unreadable.

Supabase's standard `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are supplied to Edge Functions by the platform.

## Current deployed endpoints
- `POST /functions/v1/ctrader-connect` — requires a signed-in SuperTech AI member. Creates a ten-minute, single-use OAuth state and returns the cTrader authorisation URL.
- `GET /functions/v1/ctrader-callback` — public OAuth callback. Validates and consumes state, exchanges the one-minute cTrader code, encrypts access and refresh tokens with AES-256-GCM, and stores ciphertext in the private `ctrader_oauth_grants` table.
- `POST /functions/v1/ctrader-disconnect` — requires a signed-in member and revokes stored grants for that member.

## Current boundary
The callback confirms authorisation and encrypted token storage only. It does not yet discover cTrader account IDs, create member account records, start an Open API streaming session, or enable trading. Those require the next account-discovery/gateway phase. Do not mark an account connected or allow execution based only on an OAuth grant row.

## Rollout safety
- OAuth asks for the `trading` scope because automated order placement requires trading permission.
- Automation, unattended execution and live execution default to OFF.
- Use a demo account for the first end-to-end validation.
- Do not enable live trading until account discovery, token refresh, streaming, reconciliation, risk checks, and emergency pause have passed tests.
