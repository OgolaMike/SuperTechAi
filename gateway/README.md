# SuperTech AI exchange gateway

This service provides a fixed outbound IPv4 path for already-signed Binance Spot, Binance USD-M Futures, and OKX requests originating from Supabase Edge Functions.

It is intentionally **not** a generic HTTP proxy:
- Upstream hosts are hard-coded.
- Provider paths and HTTP methods are allowlisted.
- Request headers are allowlisted.
- Every request must carry a timestamped HMAC signature from the Supabase backend.
- The service does not store member exchange API secrets.
- It never retries requests. Order timeouts are treated as uncertain and must be reconciled by client order ID.

## Local tests

Requires Node.js 22 or newer.

```sh
npm test
```

## Run locally

```sh
cp .env.example .env
# Set GATEWAY_SHARED_SECRET to a random value of at least 32 bytes.
# Set GATEWAY_DOMAIN to the DNS name pointing at this VPS.
docker compose up -d --build
curl https://exchange-gateway.example.com/healthz
```

For production, deploy on a Linux VPS with a reserved/static public IPv4 and use the included Caddy HTTPS reverse proxy. See [the unattended automation delivery guide](../docs/UNATTENDED_AUTOMATION_DELIVERY.md).

## Supabase secrets

Set these Edge Function secrets in the existing Supabase project:

- `AUTOMATION_GATEWAY_URL`: the HTTPS origin, e.g. `https://exchange-gateway.example.com`
- `AUTOMATION_GATEWAY_SECRET`: exactly the same random secret as `GATEWAY_SHARED_SECRET`

Never expose either value in frontend code or commit them to Git.

## Operational notes

- Keep a single gateway instance for this first release. The nonce replay cache is in memory; multiple replicas require a shared replay store.
- Ensure the VPS uses its reserved IPv4 for outbound traffic. Add that address to the IP allowlists on Binance and OKX API keys.
- Keep withdrawal permissions disabled.
- The health endpoint is intentionally unauthenticated and exposes only service liveness.
- Do not enable live automation until read-only connection checks, demo/testnet order tests, protective-order verification, and timeout recovery tests pass.
