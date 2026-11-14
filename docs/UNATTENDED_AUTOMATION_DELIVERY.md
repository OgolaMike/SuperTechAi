# SuperTech AI unattended automation delivery

## Objective

A member must be able to configure automation from a phone, tablet, or computer and then close that device. The device is a control panel only. Signal generation, execution, risk checks, order protection, and recovery run on the backend.

## Confirmed production findings (14 November 2026)

The existing Supabase project already contains Binance Futures, Binance Spot, OKX Futures, cTrader OAuth/account tables, and an MT5 bridge schema. The existing scanner runs every minute and invokes the Binance Futures executor.

The live Binance Futures executor was repeatedly receiving exchange responses indicating that the API key's IP or permissions were rejected, from several different cloud egress addresses. Historical records also contain Binance rate-limit/IP-ban responses. A single IP allowlist cannot safely support a serverless function whose outbound IP changes.

The live database also contained stale signal intents. Those require safe expiry/reconciliation as a separate cleanup; they must never be replayed as fresh trades. This automation work does not trigger any existing intent or place an order.

## Architecture

```text
Member device (Android / iPhone / tablet / laptop)
                    |
                    | authenticated controls only
                    v
             SuperTech AI app
                    |
                    v
        Supabase Auth + Postgres
        settings / encrypted keys / intents
                    |
                    v
       scheduled, bounded execution jobs
                    |
                    v
     Static-egress exchange gateway (HTTPS)
        fixed IPv4 + request allowlist
                    |
          +---------+----------+
          |         |          |
        Binance    OKX       other adapters
       Spot/Futures Futures   cTrader / MT5
```

The gateway is a narrowly scoped network relay, not a general-purpose proxy and not a place where member exchange secrets are stored. The Edge Functions continue to sign Binance and OKX requests locally. Only the already-signed request, API-key header, and a separate short-lived HMAC service signature are sent to the gateway. The gateway can reach only the hard-coded Binance Spot, Binance USD-M Futures, and OKX API origins.

The gateway does not retry an order request. A timeout can mean that the exchange accepted the order but the response was lost. The caller must reconcile by the deterministic client order ID before deciding what happened.

## What this branch implements

- A small Node 22 gateway service suitable for a VPS with a reserved/static public IPv4.
- HTTPS termination using Caddy and a Docker Compose deployment.
- HMAC authentication, timestamp validation, one-time nonce replay checks, fixed upstream hosts, path-prefix allowlists, header allowlists, body limits, and no arbitrary URL forwarding.
- No order retries at the gateway; ambiguous network outcomes are surfaced as uncertain.
- A Deno client helper that fails closed if the gateway is not configured.
- Binance Futures connection checks and execution, Binance Spot account checks and scanner automation, and OKX Futures API calls routed through the gateway.
- CI checks for the gateway service and exchange-gateway client.

## Host requirements

Use a small Linux VPS with:
- A reserved/static public IPv4 address that is also used for outbound IPv4 traffic.
- Ubuntu 24.04 LTS or another supported Linux distribution.
- Docker Engine and Docker Compose plugin.
- A DNS name with an A record pointing to that IPv4.
- Ports 80 and 443 open publicly; SSH restricted to administrator IPs.

A single gateway instance is intentional for the first release. If it is later replicated, replay protection and rate limiting must move to shared storage and every egress IP must be added to exchange allowlists.

## Deployment

1. Provision the VPS and reserve its public IPv4. Confirm outbound traffic to Binance/OKX uses this address.
2. Create an A record such as `exchange-gateway.your-domain.com` pointing to that IPv4.
3. Install Docker Engine and the Docker Compose plugin.
4. Clone this repository and enter `gateway/`.
5. Copy `.env.example` to `.env`. Generate a unique secret with at least 32 random bytes (for example, `openssl rand -hex 32`). Set it as `GATEWAY_SHARED_SECRET`; set `GATEWAY_DOMAIN` to the DNS name. Never commit `.env`.
6. Start the service with `docker compose up -d --build`.
7. Verify `https://exchange-gateway.your-domain.com/healthz` returns `{"ok":true,...}`.
8. Add the VPS's static IPv4 to the IP restrictions for each member's Binance/OKX API key. Keep withdrawals disabled. Grant only the required Spot/Futures trading permissions.
9. Set the Supabase Edge Function secrets:
   - `AUTOMATION_GATEWAY_URL=https://exchange-gateway.your-domain.com`
   - `AUTOMATION_GATEWAY_SECRET=<the same random secret>`
   
   Use Supabase CLI or the Supabase dashboard secret manager. Do not put the value in source code, a frontend variable, or a GitHub commit.
10. Deploy the changed Edge Functions from this branch to the existing Supabase project, then deploy the frontend through the existing Bolt deployment path. Do not create a second app.
11. Run each provider's read-only account/connection check. Confirm the request IP shown by the exchange is the reserved VPS IPv4.
12. Complete demo/testnet execution tests and reconciliation tests before enabling any member's live automation.

## Safety rules

- Do not remove Binance/OKX IP allowlists to work around the changing serverless egress.
- Never enable withdrawals on trading API keys.
- Never place an order from a connection test or health check.
- Never replay stale signal intents. The existing 8/8 signal gate remains unchanged.
- A live order is not considered ready until entry fill, protective stop, take-profit, and broker-side status are confirmed.
- On an uncertain order submission, look up the same client order ID. Do not submit a second order blindly.
- Keep per-member risk limits, max open positions, daily loss limit, symbol allowlist, and emergency stop enforced server-side.
- Preserve email verification and account recovery.
- Do not switch on the currently live-armed Binance account automatically as part of gateway deployment. Require an explicit owner-controlled re-arming step after all checks pass.

## Remaining provider work

| Provider | Current foundation | Remaining work before member live use |
|---|---|---|
| Binance Spot | Encrypted credentials, account check, scanner limit-intent flow, order reconciliation | Static-egress host, demo/testnet end-to-end verification, order lifecycle tests, then staged live enablement |
| Binance USD-M Futures | Encrypted HMAC/RSA/Ed25519 credentials, risk checks, 8/8 executor, protective orders, uncertain-order recovery | Static-egress host, investigate and safely expire stale intents, testnet/demo execution path, verify IP-bound key and full lifecycle |
| OKX Futures | Encrypted API key/secret/passphrase, risk checks, executor, attached protection, uncertain-order recovery | Static-egress host, recurring dispatch/reconciliation schedule, demo trading tests, IP binding verification |
| cTrader | OAuth connect/callback, token encryption, account discovery, connection/settings/position tables, read-only account preflight in the automation development branch | Production reconciliation deployment, protected market-order executor, token refresh/recovery, scheduled reconciliation, demo tests, then live approval |
| MT5 | Pairing and worker bridge, command queue, account/risk state | A managed always-on Windows host with licensed MT5 terminal(s), broker compatibility, secure worker provisioning and recovery. A member's phone alone cannot keep a local MT5 terminal running |
| Deriv | Existing market-data feed | A separate authorised trading-account connection and execution adapter are required before Deriv trade automation can be offered |

## Acceptance checklist

- [ ] Gateway has a fixed outbound IPv4 and HTTPS certificate.
- [ ] Gateway rejects invalid HMAC, expired timestamps, replayed nonces, arbitrary hosts, arbitrary paths, unsupported methods, and disallowed headers.
- [ ] Gateway does not log API secrets, signatures, query strings, or request bodies.
- [ ] Supabase secrets are configured; the client helper has no direct-egress fallback.
- [ ] Binance Spot and Futures read-only connection checks succeed through the fixed IP.
- [ ] OKX read-only account check succeeds through the fixed IP.
- [ ] Demo/testnet order is submitted once, confirmed by client order ID, and has broker-side protection.
- [ ] Timeout/restart tests prove that uncertain orders are reconciled without duplicate submissions.
- [ ] Turning automation off and emergency stop take effect server-side.
- [ ] Closing or powering off the member's device does not stop backend execution.
- [ ] cTrader and MT5 pass their own provider-specific acceptance tests.
- [ ] Live trading is enabled only after the owner explicitly approves the completed test results.
