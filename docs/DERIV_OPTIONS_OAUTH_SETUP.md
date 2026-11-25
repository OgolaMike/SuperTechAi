# Deriv Options Trader account connection

The Options Trader uses Deriv's OAuth 2.0 Authorization Code flow with PKCE. Members tap **Connect Deriv**, sign in and approve access on Deriv's own website, then return to SuperTech AI. Passwords and API tokens are never entered into the SuperTech AI UI.

## Deriv application registration

Register an OAuth 2.0 application in the Deriv developer dashboard. Enable the `trade` scope only; the Options Trader currently needs account listing and trading permission, not payment or withdrawal permissions.

Set the OAuth redirect URL to this exact endpoint:

```
https://jtfsqhewotinvlrcadwq.supabase.co/functions/v1/deriv-callback
```

The redirect URL in Deriv and the `DERIV_REDIRECT_URI` secret must match exactly. Copy the OAuth client ID from the registered application.

## Edge Function secrets

Configure these secrets for the existing SuperTech AI Supabase project:

- `DERIV_CLIENT_ID`: OAuth client ID from Deriv.
- `DERIV_REDIRECT_URI`: `https://jtfsqhewotinvlrcadwq.supabase.co/functions/v1/deriv-callback`
- `DERIV_TOKEN_ENCRYPTION_KEY`: base64-encoded 32-byte random key for AES-256-GCM credential encryption. Generate a unique key; do not reuse another provider's key.
- `APP_URL`: the exact HTTPS frontend origin to return members to and allow in CORS. Use the branch preview origin while testing, then change to the approved production origin after deployment.
- `OPTIONS_MAX_STAKE`: server-enforced maximum stake for proposal quotes. Set a conservative Demo-test limit in the isolated test backend; do not use a client-provided limit.

Generate an encryption key with:

```sh
openssl rand -base64 32
```

Never commit these values to GitHub or expose them in Vite/browser environment variables.

## Deploy and verify

1. Apply migration `20261126120000_add_deriv_options_oauth.sql`.
2. Set the four Edge Function secrets above.
3. Deploy `deriv-connect`, `deriv-callback`, `deriv-status`, `deriv-disconnect`, and `deriv-options-proposal` to the isolated test backend only.
4. Register the exact callback URL in Deriv.
5. Test with a Demo account first. Confirm the returned account list shows the expected account ID, account type and currency.
6. Confirm expired authorisation prompts the member to reconnect. Deriv does not issue refresh tokens to third-party OAuth apps.
7. The `deriv-options-proposal` function currently requests a quote only; it does not buy a contract. Keep automatic order execution disabled until purchase, open-contract monitoring, settlement, persistence and end-to-end Demo tests are complete.

## Security design

- PKCE verifier and one-time OAuth state are generated server-side; state is hashed and expires after ten minutes.
- Callback validates and consumes state before exchanging the single-use code.
- Token exchange happens only in the backend.
- Access tokens are encrypted at rest with AES-256-GCM and are never returned to the browser.
- RLS is enabled and all table access is revoked from `anon` and `authenticated`; only service-role Edge Functions can access OAuth records.
- Disconnect removes the stored grant from SuperTech AI. If a member also wants to revoke the app's authorisation at Deriv, they should remove it from their Deriv account's authorised applications.
