# SuperTechAi Trader — cTrader automation architecture

## Decision

Use **cTrader Open API as the member connection and execution interface**, with a shared, horizontally scalable SuperTech AI backend. Members connect from Android or PC using cTrader's OAuth authorisation flow. SuperTech AI does not collect or store cTrader passwords, and members do not need to run a Windows terminal or buy an individual VPS.

The existing cTrader cBot remains a strategy prototype/build artifact for research and broker-side comparison. It is not the production multi-member execution architecture. Do not build a MetaApi dependency or revive the MT5 terminal worker for this path.

## Target topology

```text
SuperTech AI PWA / Android / PC
        |
        | signed-in member session
        v
Supabase Edge Functions: connect / callback / settings / disconnect
        |
        | OAuth state + account metadata
        v
cTrader OAuth 2.0  <---->  External Secret Manager
        |
        | authorised account + opaque secret reference
        v
cTrader Open API Gateway / Account Registry
        |
        +---- Account stream manager (one logical session per account)
        |       | live prices, bars, account events, order/position events
        |       v
        |    Normalised Market & Broker Event Bus
        |
        +---- Signal & Strategy Engine
        |       | confirmed candles, eight-TF context, M15 trigger
        |       v
        |    Durable Execution Intent Ledger (Supabase/Postgres)
        |
        +---- Risk & Permission Gate
        |       | idempotency, account mode, exposure, daily loss,
        |       | spread, margin, broker symbol constraints
        |       v
        +---- Execution Dispatcher
                | cTrader Open API order/modify/close requests
                v
           Deriv cTrader account

Broker order/position events
        |
        v
Reconciliation + audit + daily risk snapshots
        |
        v
SuperTech AI Dashboard / Event History / Notifications
```

## Member experience

1. Member signs in to SuperTech AI on Android, PC or PWA.
2. Selects **Connect cTrader**. The app redirects to the official cTrader authorisation page.
3. Member signs in with the broker and approves the requested cTrader permissions. The app never asks for the broker password.
4. The OAuth callback validates a single-use, short-lived state value and exchanges the authorisation code server-side.
5. The backend resolves the authorised cTrader account(s), stores access/refresh tokens in the external secret manager, and writes only opaque secret references plus account metadata to Supabase.
6. Member selects the Deriv demo/live account, reviews risk controls and explicitly enables automation. Automation and live execution are separate opt-ins. Both default OFF.
7. Dashboard shows connection health, account balance/equity, automation state, open bot-managed positions, recent orders, risk usage and event history.
8. Member can pause new entries or disconnect at any time. Emergency pause blocks new orders immediately; broker-side protective SL/TP remain attached to open positions.

## Runtime and scale

- A shared backend worker pool runs in our infrastructure; no member PC, Android phone, Windows terminal or per-member VPS is required.
- Use cTrader Open API streaming connections for account and market events. Maintain one active lease per account so two workers cannot concurrently manage the same account.
- Reconnect with bounded exponential backoff, refresh authorisation when supported, resubscribe, then reconcile broker orders/positions before processing new intents.
- Persist all intents and execution transitions. In-memory queues are only an optimisation; Postgres is the durable source of truth.
- Partition work by cTrader account ID. Apply per-account rate limits and global concurrency limits.
- Monitor connection heartbeat, stream lag, rejected requests, uncertain submissions, reconciliation drift and daily risk locks.

## Strategy contract

The execution adapter must not invent a second strategy. The backend strategy engine is the canonical source for automation and must consume the same approved signal definitions as the SuperTech AI dashboard.

- Eight timeframes: M1, M5, M15, M30, H1, H4, D1 and W1. W1 is derived from complete daily candles when the source feed does not provide a reliable weekly series.
- Evaluate only completed candles; persist candle epoch and stable signal key.
- M15 is the execution timeframe. Require the agreed M5 and M30 confluence for automated M15 entries. M1/M5/M15 are used to identify early trend development, not as a reason to bypass higher-timeframe context.
- Higher-timeframe reversal analysis distinguishes a pullback from a genuine trend change and records evidence/confirmation still required.
- Preserve SMA 60 and Bollinger Bands 2.5σ unless a separately approved strategy version changes them.
- One final target at +2.5σ. Initial stop at -1σ; advance to 0σ, +1σ and +1.5σ after each additional +1σ favourable move. Recalculate the target when the stop stage advances, subject to broker stop/freeze constraints.
- Limit-order quality rules remain distinct from market/stop entry rules. The strict M5 momentum/quality gate applies to limit orders only.
- Every intent stores strategy version, signal key, candle epoch, symbol, timeframe, direction and account-scoped idempotency key.

## Execution lifecycle

```text
CLOSED_CANDLE_SIGNAL
  -> STRATEGY_QUALIFIED
  -> INTENT_PERSISTED (unique account + idempotency key)
  -> RISK_CHECKED
  -> LEASED_TO_ACCOUNT_WORKER
  -> SUBMISSION_RECORDED
  -> BROKER_ACKNOWLEDGED
  -> ORDER/POSITION_RECONCILED
  -> MANAGED (SL/TP updates)
  -> CLOSED + FINAL PNL
```

A timeout after sending an order is **UNCERTAIN**, not failed. The worker must query broker orders/deals/positions and reconcile using client order identifiers/comments before any retry. Never blindly resend an uncertain order. Every SL/TP update is monotonic in protection and idempotent. The engine only modifies positions marked as strategy-owned by this system; it must never adopt or alter manual positions without a separate explicit product decision.

## Mandatory risk and safety controls

- Automation OFF by default; live execution OFF by default; demo is the first rollout environment.
- Per-trade risk default 0.50%, configurable only within approved bounds; daily loss lock default 2%; maximum concurrent bot-managed positions default 1.
- Validate current account mode, connection freshness, subscription/entitlement, symbol trading status, quote age, spread, volume step/min/max, margin, stop distance, market hours and exposure immediately before submission.
- Size from broker contract specifications and account equity; reject if sizing cannot be calculated safely or minimum volume breaches the risk budget.
- Daily loss baselines and realised/unrealised PnL are persisted by account and UTC trading date. Worker restarts must never reset risk limits.
- Global kill switch, per-member pause, per-account pause, stale-feed lock, disconnect lock and daily-loss lock all fail closed.
- Attach broker-side SL/TP with initial order where supported. If protection cannot be confirmed, attempt a controlled emergency close and alert; do not silently leave an unprotected position.
- Keep append-only audit events. Never log OAuth codes, access/refresh tokens, passwords or secret values.

## Data model added

Migration `20261105130000_create_ctrader_automation_foundation.sql` creates:
- `ctrader_connections`: member/account metadata and secret-manager references.
- `ctrader_execution_settings`: separate automation/live opt-ins and risk settings.
- `ctrader_oauth_states`: single-use OAuth state records.
- `ctrader_execution_intents`: durable account-scoped idempotent intent ledger.
- `ctrader_positions`: broker-reconciled position inventory with explicit strategy ownership.
- `ctrader_runtime_leases`: one active account manager at a time.
- `ctrader_daily_risk_snapshots`: restart-safe daily risk baselines.
- `ctrader_execution_events`: service-only audit trail.

The migration is committed to the repository but must still be applied to the Supabase project before runtime use.

## Delivery sequence

### Phase 1 — Foundation (this architecture commit)
- Define the Open API based topology and member OAuth flow.
- Add account, settings, OAuth state, intent, position, lease, risk and audit schema.
- Keep all execution and live permissions disabled by default.

### Phase 2 — OAuth and account registry
- Register the SuperTech AI application with cTrader.
- Implement connect/callback/disconnect Edge Functions.
- Use PKCE/state, exact redirect allow-list, server-side code exchange and external secret manager.
- Discover and persist account metadata; test Deriv entity and country eligibility.

### Phase 3 — Open API gateway
- Implement streaming session lifecycle, account leases, reconnection and broker reconciliation.
- Add typed adapter interfaces for account, symbol, quote, order, position and deal operations.
- Implement a simulator/fake broker for deterministic tests.

### Phase 4 — Strategy and risk services
- Move the approved candle-close strategy into a backend package with versioned configuration.
- Reuse the dashboard's signal semantics; add M5/M30 M15-entry confluence and limit-order-only quality gate.
- Implement persistent daily risk, idempotent intent generation and emergency stop.

### Phase 5 — Execution and dashboard
- Implement demo-only order placement, protection verification, trailing management and close lifecycle.
- Expose member connection, automation toggle, risk settings, account status, positions and event history.
- Add notifications for fills, rejections, protection failures, pauses and daily risk locks.

### Phase 6 — Validation and controlled release
- Unit, contract, integration and broker demo tests.
- Test duplicate candles, duplicate webhooks, worker failover, token expiry, rate limits, timeout-after-send, partial fills, rejected stops, symbol aliases, weekend gaps, restart recovery and emergency pause.
- Require a documented demo forward-test period and sign-off before any live enablement.

## Explicit non-goals / current limitations

- This architecture commit does not connect a real cTrader account, create a cTrader developer application, store tokens, run a gateway, or place orders.
- The current `ctrader/SuperTechAiTrader` cBot is a separate prototype and is not connected to this multi-member service.
- The migration is not automatically deployed to Supabase.
- cTrader Open API application approval, account permissions, Deriv entity/country availability, API rate limits and hosting cost must be confirmed before promising universal member access or zero-cost operation.
- Never advertise automation as active until the full demo execution and reconciliation path has passed end-to-end tests.
