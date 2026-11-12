# SuperTech AI — Unified Mobile Automation Architecture

Status: architecture/audit branch only. No production functions, trading settings, credentials, or live execution were changed.

## Goal

A member should be able to connect a supported broker/exchange from the SuperTech AI mobile app, configure automation, and then close the app. Cloud services continue scanning, routing approved signals, executing orders, protecting positions, reconciling fills, and reporting status. The phone is the control surface, not the trading terminal.

## Repository and deployed-function audit

Supabase project: `jtfsqhewotinvlrcadwq`
Repository: `OgolaMike/SuperTechAi` (default branch `main`)

| Integration | Existing implementation observed | Current gap / next action |
|---|---|---|
| Binance Spot | `binance-spot` v8 connection/settings/status function; scanner contains `binanceSpotAutomation.ts` for limit-intent submission and order reconciliation | Move exchange I/O behind a shared server adapter without changing the current order lifecycle. Confirm scanner scheduling and reconcile behavior before migration. |
| Binance USD-M Futures | `binance-futures` v13; `binance-futures-executor` v6; scanner creates eligible 8/8 intents and invokes executor | Executor signs requests directly from Supabase Edge Functions. Static outbound IP is needed for IP-restricted HMAC keys. Keep current risk, freshness, One-way Mode, duplicate and protective-order checks. |
| OKX USDT swaps | `okx-futures` v5; `okx-futures-executor` v3; scanner creates intents and invokes executor | Separate direct-fetch executor, own encrypted credential fields/settings. Add to shared adapter contract, but preserve OKX-specific contract sizing, position mode and attached-algo protection. Audit recovery for uncertain network outcomes before moving. |
| cTrader | OAuth connect/callback and account discovery functions; account connection/settings/event tables; account discovery opens a WebSocket to retrieve accounts | This is authorization/account discovery, not a complete order execution adapter yet. Build persistent live/demo WebSocket sessions, token refresh, heartbeat, message queue, order/position reconciliation, and execution controls. |
| MetaTrader 5 | `mt5-bridge` v5 with worker registration, lease/command queue, idempotency keys, risk preflight and execution attempts; separate `mt5-worker` Python package | The current worker is Windows-only and requires a logged-in MT5 desktop terminal. Its README explicitly says it does **not** yet execute SuperTech signals unattended, manage open positions, trail stops, cancel pending orders or close trades; it only places member-confirmed pending orders. A mobile UI cannot itself host the terminal. Deliver a managed always-on Windows worker and implement the missing unattended lifecycle before claiming full MT5 automation. |
| Deriv | Public WebSocket market-data client and scanner feed | Data-only today. Deriv's current API supports OAuth 2.0 + PKCE and authenticated WebSocket buy/sell/contract monitoring. Add a separate account connection and execution adapter; tokens expire and the documented OAuth flow does not issue refresh tokens, so mobile reauthorization must be supported. Do not mistake public market-data access for account authorization. |

The deployed function inventory also contains `scanner` v29, `push` v11 and related application functions. This plan does not replace the scanner or alter member-facing signal generation.

## Target topology

1. **Mobile control plane (existing SuperTech AI app):** one Connections screen, provider authorization, account/environment selection, per-account automation toggles, risk limits, emergency stop, status, and order history.
2. **Supabase control plane (retain):** Auth, encrypted credential/token records, account settings, signal intents, risk state, order ledger, execution attempts, audit events, notifications and RLS.
3. **Always-on Linux execution service:** authenticated internal API, durable job consumer, Binance Spot/Futures and OKX adapters, cTrader session manager, Deriv session manager, health/heartbeat and outbound static-IP routing where required.
4. **MT5 host adapter:** a dedicated Windows terminal/worker process using the existing secure MT5 bridge. It registers from the cloud, leases commands, reports heartbeats and returns execution outcomes. It is not replaced by a Linux-only Python wrapper.
5. **Provider adapters:** each provider owns its own signing/authentication, instrument metadata, quantity precision, order types, attached protection, rate limits, retry rules and reconciliation. The orchestration layer uses a common intent contract but does not flatten provider-specific semantics.

## Common execution contract

Each approved intent must carry:
- provider and account/connection ID;
- stable intent ID and deterministic idempotency key;
- symbol/instrument, side, order type and validated price levels;
- strategy/version and signal timestamp/expiry;
- risk snapshot and maximum loss budget;
- explicit demo/live environment and authorization state.

Lifecycle: `created -> validated -> claimed -> submitting -> accepted/partially_filled/filled -> protected -> reconciled`, with terminal `rejected/expired/cancelled` states and an `uncertain` state for timeouts where the broker may have accepted an order. An uncertain submission must be reconciled by client order ID before any retry. Never blindly retry a market order.

## Non-negotiable safety

- No exchange API key/secret or broker password in the mobile client, URLs, logs, analytics, or chat.
- Request minimum scopes/permissions; withdrawal permission remains disabled.
- Encrypt provider credentials at rest; use separate encryption keys by provider or a documented key-version migration.
- Authenticate every internal gateway call with service identity, short-lived signed requests, replay protection and account-level authorization.
- Enforce risk limits server-side immediately before order submission; client toggles are not trusted.
- Preserve emergency stop, daily loss cap, maximum positions, symbol allowlists, fresh-signal checks and protective SL/TP confirmation.
- Fail closed if a protective order is rejected. Reconcile whether an order/position exists before attempting a compensating close.
- Separate demo and live credentials, queues, environment flags and audit records.
- Keep production execution disabled during migration; no connectivity test should place a trade.
- Add health checks for each adapter and alert on stale worker heartbeat, expired token, rejected credentials, unprotected position, or queue backlog.

## Mobile connection flows

- Binance Spot/Futures and OKX: member enters exchange API credentials into a backend-only secure connection flow; verify read/trade scopes, account identity, and withdrawal-disabled status before saving encrypted credentials.
- cTrader: OAuth account consent and discovery; no broker password collection.
- Deriv: OAuth 2.0 Authorization Code + PKCE; request only the trade scope required for execution, store token expiry, and send the user through consent again after expiry because no refresh token is issued.
- MT5: pair the account to a cloud-hosted worker. The member uses mobile to authorize/configure it, while the terminal and worker remain online in the managed host.

## Open-source reuse policy

- Prefer official provider documentation and SDKs for cTrader and Deriv.
- CCXT is MIT-licensed and can be evaluated as a shared crypto REST adapter for supported exchanges. It is not a hosted gateway, does not supply static egress IPs, and does not replace our risk, idempotency, protection, or reconciliation logic. Do not swap existing Binance/OKX order paths to CCXT until parity tests pass.
- Third-party MT5 Docker/Wine repositories are research references only. Their existence does not prove reliable or vendor-supported MT5 execution on a free ARM Linux instance. Review licenses, dependencies, security posture and terminal compatibility before reuse.
- Copy only code with a compatible license, preserve required notices, pin versions/commits, and add SuperTech-specific tests. Do not import an entire bot with its own strategy or risk policy.

## Delivery phases

### Phase 0 — Baseline and safety inventory
- Snapshot existing function versions, schema, secrets names (never values), scanner call graph, and current execution settings.
- Add automated tests around signal freshness, idempotency, risk limits, demo/live separation, and protective-order failure paths.
- Verify every current adapter's order reconciliation and failure semantics.

### Phase 1 — Mobile connection foundation
- Normalize provider account records behind a common connection registry while retaining provider-specific credential tables during migration.
- Add connection capabilities/status fields (connectivity, trading authorization, environment, last heartbeat/check, required reauthorization).
- Make the mobile UI a single provider-agnostic connection dashboard. cTrader and Deriv use OAuth consent; Binance/OKX use exchange API credentials entered only into the secure backend flow; MT5 pairs with the cloud-hosted worker.

### Phase 2 — Shared cloud execution service
- Build a small, always-on Linux service with static outbound IPv4 and private ingress.
- Start with Binance Spot/Futures and OKX adapter wrappers around existing tested behavior; add idempotent job consumption and broker reconciliation.
- Route cTrader and Deriv persistent WebSocket sessions through provider-specific session managers.
- Keep Supabase Edge Functions as authenticated control-plane endpoints and compatibility shims until each adapter passes parity tests.

### Phase 3 — MT5 mobile-first hosting
- Package the existing Windows worker for managed installation on a continuously running Windows host.
- The member pairs an account from mobile; the worker's host stays online independently of the member's phone.
- Do not promise a zero-cost, all-platform MT5 host until Windows terminal hosting and broker compatibility are demonstrated. An Oracle Always Free ARM Linux VM is not a drop-in replacement for a Windows MT5 terminal.

### Phase 4 — Safe cutover
- Shadow mode first: compare decisions and preflight outputs without submitting orders.
- Demo execution next, provider by provider.
- Reconcile broker state against SuperTech records; run duplicate and outage tests.
- Enable live execution only after explicit member authorization, operational sign-off and rollback plan.

## Hosting decision

A single Linux cloud host can support the crypto adapters and persistent cTrader/Deriv sessions. A static egress IP solves Binance's IP allowlist constraint only for traffic that actually exits through that host. It does not solve MT5's Windows terminal dependency.

Oracle Cloud Always Free can be evaluated for the Linux component, but free capacity, account eligibility, IPv4 charges and resource reclamation must be verified before promising zero monthly cost. A truly free and dependable Windows MT5 host is not established. The product can still be mobile-first; the execution infrastructure simply remains online in the cloud.

## Current branch implementation (not deployed)

The development branch now contains:
- A mobile Connections control centre that opens the existing Binance, OKX, cTrader and MT5 management screens.
- A read-only `automation-status` Edge Function. It validates the signed-in member, scopes every settings/worker query to that member's `user_id`, selects only non-secret health fields, masks the MT5 account login to its last four characters, and sends `Cache-Control: no-store`.
- Status classification that distinguishes connected, connecting, attention-required and not-connected states. MT5 is only shown connected when a member's worker reports a recent heartbeat.
- Unit tests for status classification, heartbeat freshness and account-login masking, alongside the shared execution-contract tests.

The browser does not query private OKX settings or the MT5 worker table directly. The service endpoint does not return credentials, token references, worker-token hashes, or order data. It is still a status view, not a broker connectivity preflight or permission to trade.

The provider-neutral execution contract is now enforced in the existing Binance USD-M Futures and OKX Futures Edge Function executors immediately before their provider-specific order setup/submission. Both adapters retain their own exchange sizing, position-mode checks, risk checks, attached/conditional protection and order reconciliation. The contract adds a common final validation for provider/account identity, signal expiry, side/order shape, size, protection geometry, risk ceilings, environment, live authorization and emergency stop. No new executor has replaced either adapter, and this is not yet an always-on external gateway.

This work exists on the development branch and remains behind PR review/CI. It does not deploy an Edge Function, alter production database schema or secrets, rotate credentials, change live flags, invoke an executor, or submit a broker order. Binance Spot still needs its own contract integration and provider parity tests; full execution gateway hosting and static egress remain separate work.
