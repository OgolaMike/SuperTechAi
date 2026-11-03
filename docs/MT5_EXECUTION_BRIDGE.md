# MT5 execution bridge — implementation contract

## Current delivery boundary

The web app is a React/Vite client with Supabase authentication, database and Edge Functions. It does not contain a running MetaTrader 5 terminal or a broker execution process. A browser-only login form cannot execute MT5 orders.

The MT5 dashboard entry is intentionally a setup foundation. It does not claim a broker connection, save a password, or place trades. The password field is cleared on submit and the UI explains that the bridge is not yet deployed.

## Required runtime

Deploy one isolated Windows VPS/hosted Windows worker per supported broker environment (or a securely pooled worker service). The worker runs the official MT5 terminal and a signed execution agent using the MetaTrader5 Python package. The agent must accept the account type supplied by the member's broker credentials/server, including demo or live accounts. Do not reject a valid account because it is live. Require explicit member authorization before enabling order placement or management on any account.

## Credential handling

- Accept the MT5 login, trading password and exact broker server only over TLS to an authenticated backend endpoint.
- Do not send passwords to browser analytics, logs, error traces, Supabase table rows, or client storage.
- Store credentials only in a managed secret store or encrypted worker secret vault; use a unique encryption key held outside the database.
- Never return the password to the browser after submission.
- Support disconnect/revocation and credential rotation.
- Do not accept investor/read-only passwords for execution.
- The database migration stores login/server and permissions only; it has no password column.

## Order adoption

On first successful bridge connection, read and display all existing pending orders and open positions. Do not modify, cancel, or close them on import. Require separate user permissions for:
1. importing/monitoring pending orders;
2. managing existing positions;
3. placing new orders.

Only orders explicitly adopted by the member may be modified by SuperTech AI. Preserve manual orders outside the adoption scope.

## New-order decision contract

- Use the existing eight-timeframe client intelligence configuration: M1, M5, M15, M30, H1, H2, H4 and D1.
- M15 is the execution timeframe. Evaluate only after a fully closed M15 candle.
- Apply the existing configured M5/M30 confluence and the current signal/reversal rules; do not create a second competing indicator strategy.
- Trend-continuation pending entries may use Buy Stop or Sell Stop only when the signal direction, entry distance, broker stop-level, spread and expiry checks all pass.
- Calculate volume from an explicit per-account risk limit and broker symbol contract specifications. Never assume a universal lot size.
- Validate minimum/maximum volume, volume step, tick size, tick value, stops level, freeze level, trading sessions and market status before sending.
- Use a deterministic idempotency key based on account, symbol, M15 candle epoch, direction and strategy version. Persist execution intent before submission and reconcile uncertain submissions with broker order/deal history before retrying.
- Keep the current strategy's stop/target/trailing rules as a versioned policy. Do not silently translate incompatible MT5 symbol digits or contract sizes.
- A new opposite signal must follow the configured reversal policy; it must not blindly close unrelated manual positions.

## Safety and operations

- Support both demo and live accounts; do not force demo mode or infer account type from the login number. Use broker/terminal connection metadata where available.
- Before the first order is placed on any account, show the account identity and require explicit authorization for new entries. Require separate permissions for pending-order adoption and existing-position management. Apply visible risk limits and emergency pause to both demo and live accounts.
- Per-account maximum open trades, maximum daily loss, max spread, max slippage and max risk per trade.
- Emergency pause, cancel-owned-pending-orders and close-owned-positions controls; never close unowned manual trades.
- Heartbeats, reconnect with backoff, broker error mapping, order reconciliation and immutable audit events.
- Report order request, broker retcode, resulting ticket, fill price, slippage and timestamps.
- Test on demo with market closed/open, rejected stops, partial fills, disconnect during send, duplicate signal, restart recovery and symbol suffix variations.

## Important existing code finding

The browser-side `src/lib/sma.ts` defines eight timeframes (M1, M5, M15, M30, H1, H2, H4, D1). The current Supabase scanner function's local `TIMEFRAMES` array defines seven (D1, H4, H2, H1, M30, M15, M5) and does not yet scan M1. Keep this discrepancy visible and resolve it before claiming eight-timeframe server-side automation. The MT5 bridge must consume a canonical, versioned signal payload rather than trusting browser-only state for unattended execution.

## Deployment checklist

1. Apply the MT5 settings migration.
2. Deploy the authenticated credential enrollment and bridge pairing endpoints.
3. Provision Windows VPS worker and secret storage.
4. Add signed worker heartbeat and command/result channels.
5. Add broker demo connection test and order reconciliation.
6. Wire only confirmed, fresh M15 signals into the order-intent queue.
7. Run end-to-end tests on a demo account where available, but do not block a member from connecting a live account. For live accounts, require explicit trading authorization and all configured risk safeguards before any order can be sent.
