# MT5 execution bridge — implementation contract

## Current delivery boundary (source of truth)

The web app pairs a member account to a private Windows MT5 worker. The worker supports account/order/position reads and guarded placement of BUY_STOP, SELL_STOP, BUY_LIMIT and SELL_LIMIT orders after a successful dry-run, saved risk/permission checks, explicit member confirmation and final server/broker authorization.

The current release is **not unattended signal automation**. It does not yet turn live SuperTech AI signals into orders, modify/manage open positions, implement staged trailing stops, cancel pending orders or close positions. Existing manual trades remain untouched unless explicitly adopted; adoption currently records ownership intent rather than enabling a management workflow.

A private Windows PC or Windows VPS with the official MT5 desktop terminal and worker running is required. Android can operate the dashboard but cannot host the worker. Broker execution is not production-verified until the matching Supabase migrations and Edge Function are deployed and an actual broker end-to-end test succeeds. The app never collects the broker password.

## Required runtime

Deploy one isolated Windows VPS/hosted Windows worker per supported broker environment (or a securely pooled worker service). The worker runs the official MT5 terminal and a signed execution agent using the MetaTrader5 Python package. The agent must accept the account type supplied by the member's broker credentials/server, including demo or live accounts. Do not reject a valid account because it is live. Require explicit member authorization before enabling order placement or management on any account.

## Credential handling

- Current implementation uses the member's own logged-in official MT5 desktop terminal on their Windows computer/VPS. The member enters no broker password into SuperTech AI.
- The worker uses the terminal's already-authenticated local session and reports only the account number/server for identity matching.
- Never collect, transmit, log, or store the broker trading password in the app, Supabase, worker configuration, analytics or GitHub.
- Worker bearer tokens are separate from broker credentials and are stored in Windows Credential Manager; only their SHA-256 hashes are stored in Supabase.
- Re-pairing revokes previously issued worker tokens.
- The database stores account login/server metadata and permissions only; it has no password column.
- A future centrally hosted terminal architecture would require a separately reviewed managed secret vault, but it is not required for this local-terminal worker design.

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

The browser and Supabase scanner now use the same eight timeframes: M1, M5, M15, M30, H1, H2, H4 and D1. The scanner still has a 100-second execution budget and rotates its starting symbol to share coverage across the discovered market list; this means a single run is not a guarantee that every symbol/timeframe pair was processed. The MT5 bridge must consume fresh, server-confirmed, versioned signal data rather than trusting browser-only state for unattended execution.

## Deployment checklist

1. Apply the MT5 settings migration.
2. Deploy the authenticated credential enrollment and bridge pairing endpoints.
3. Provision Windows VPS worker and secret storage.
4. Add signed worker heartbeat and command/result channels.
5. Add broker demo connection test and order reconciliation.
6. Wire only confirmed, fresh M15 signals into the order-intent queue.
7. Run end-to-end tests on a demo account where available, but do not block a member from connecting a live account. For live accounts, require explicit trading authorization and all configured risk safeguards before any order can be sent.


## Current repository delivery status

- The Supabase scanner now includes M1 and matches the browser's eight-timeframe list.
- The MT5 account settings migration stores account metadata and three independent permissions; it never stores passwords.
- The bridge command queue, worker registry and execution audit tables are service-role-only. The paired Windows worker supports read operations and a gated pending-order execution path; actual broker readiness still depends on member deployment and end-to-end validation.
- The dashboard deliberately blocks credential entry while the bridge is offline.
- A gated pending-order execution path is now implemented. It is not an unattended signal executor, and it must not be considered production-verified until the new migration and Edge Function are deployed and a broker end-to-end test succeeds.

## Worker API foundation (added)

The `mt5-bridge` Supabase Edge Function now supports three worker actions:

- `heartbeat`: marks the registered worker online and records its version/last-seen time.
- `poll`: atomically leases up to ten commands for that worker's member account. Expired leases can be reclaimed after a worker restart.
- `complete`: records success/failure only when the command is currently leased to that same worker and belongs to the same member account.

Worker authentication uses a per-worker random bearer token. The database stores only its SHA-256 hash in `mt5_bridge_workers.worker_token_hash`; the raw token must be provisioned into the worker's OS-protected secret store and must never be committed to source control. The endpoint checks both worker ID and token hash. The claim function uses row locking with `SKIP LOCKED` to avoid two workers claiming the same command.

### Provisioning still required

1. Apply migrations through `20261103183000_secure_mt5_worker_leasing.sql`.
2. Generate a cryptographically random token of at least 32 bytes for each worker, hash it with SHA-256, and insert only the hash with the worker ID and owning user ID using the Supabase service role.
3. Store the raw token only in the worker host's protected OS secret store.
4. Deploy the `mt5-bridge` Edge Function.
5. Configure the worker to call the endpoint over HTTPS using the worker ID header and bearer token.

The Edge Function is a command transport and authorization boundary. It never logs in to the broker or stores MT5 passwords. It authorizes a pending-order command only after member approval and repeated server-side permission/risk checks; the private Windows worker sends the broker request.

## Pending limit-order momentum filter

The existing signal-generation and reversal rules are unchanged. The added quality gate applies only to educational Buy Limit and Sell Limit ideas in `src/lib/pendingOrders.ts`; Buy Stop and Sell Stop generation is deliberately left on its previous path.

A limit idea is shown only when all of these checks pass:

- The latest confirmed M5 signal is active, fresh (no older than six M5 bars), and points in the same direction as the existing eight-timeframe agreement.
- At least four of the latest five closed M5 candle bodies point in the intended direction.
- The five-candle directional move is efficient (not choppy), candle bodies make up at least half of the total candle range, and the net move is at least 0.3 of the M5 rolling standard deviation.
- The trained historical-outcome model can score the M5 signal and returns at least 70/100.

If the model is not trained sufficiently, or any M5 condition fails, the limit idea is withheld. This is intentionally conservative: it can reduce the number of limit ideas, and it does not guarantee profitable fills. The UI displays the M5 AI score and momentum score on approved limit ideas.

## Windows worker and member pairing (added)

The repository includes `mt5-worker/`, a Windows Python worker that connects to an already logged-in MetaTrader 5 desktop terminal. It supports both demo and live accounts, has no broker-password input, and sends only individually approved pending orders after repeated safety checks.

The MT5 dashboard now offers member-authenticated worker pairing. A signed-in member enters only the MT5 account number and exact broker server. The Edge Function validates the member's Supabase session, stores those account identifiers and creates a worker ID plus a cryptographically random 32-byte token. Only the SHA-256 token hash is stored in the database; the raw token is returned once for the member to provision into Windows Credential Manager. Re-pairing revokes prior worker tokens for that member.

On every heartbeat, the worker reports its actual terminal login and server. The Edge Function compares both values with the member's saved account details. A mismatch marks the bridge as an error and refuses to mark the worker online. The dashboard reads the member's own connection status and last heartbeat through RLS.

### Current worker command support

- Read account identity, balance, equity and free margin.
- Read pending orders without changing them.
- Read open positions without changing them.
- Report heartbeat and connection status.
- Reject every unsupported command, including all order placement, modification, cancellation and position-closing commands.

### Setup

1. Deploy the `mt5-bridge` Edge Function and apply the bridge database migrations.
2. Open MT5 Auto Trading in the signed-in app and enter the account number and exact broker server (no password).
3. Copy the one-time worker ID and token shown by the app.
4. Install `mt5-worker` on the Windows computer/VPS, log into the matching MT5 account in the official terminal, and follow its README.
5. Provision the token using the hidden prompt so it is stored in Windows Credential Manager.
6. Keep the terminal and worker running. The dashboard should show Connected after a matching heartbeat.

This is a read-only connectivity milestone, not automated trading. The worker does not adopt or alter existing trades. New-order execution, separate permissions persistence, risk limits, trade reconciliation and broker-level end-to-end tests remain future work. The chosen local-terminal design does not require SuperTech AI to collect or centrally store broker passwords.

### Read-only account synchronization

Once the dashboard reports the worker as connected, the member can request a read-only sync. The authenticated Edge Function enqueues three account-scoped commands: `sync_account`, `list_pending_orders` and `list_positions`. The worker executes only these allowlisted read operations and reports results. The member can view the returned account snapshot and order/position lists in the dashboard. Every request uses a unique idempotency prefix, and the status endpoint filters by the authenticated member ID so one member cannot inspect another member's command results.

## Per-account permissions and risk controls (added)

The MT5 dashboard now loads and saves execution permissions against the signed-in member's own `mt5_account_settings` row using its existing RLS policy. Permissions are independent:

- Import existing pending orders.
- Manage existing positions (future strategy-owned/adopted positions only; never implicitly all manual positions).
- Place new SuperTech AI strategy orders.

The dashboard also stores per-account risk limits with database constraints and conservative defaults:

- Maximum planned risk per new trade: 0.50% of account equity (configurable up to 2.00%).
- Daily equity-loss stop: 2.00% (configurable up to 5.00%).
- Maximum strategy-owned open positions: 3 (configurable 1–20).
- Maximum spread and slippage: default 0 points. These must be explicitly configured to broker-appropriate values before risk controls can be enabled.

Saving these preferences does not activate execution. Pending-order execution additionally requires the separate live-execution switch, emergency stop off, a successful dry-run and explicit per-order member confirmation. The worker calculates volume in account currency, checks spread, daily loss, concurrent positions including pending orders, margin and broker order_check. A zero spread or slippage ceiling remains fail-closed.

## MT5 order-risk preflight module (added)

The Windows worker now includes `mt5-worker/risk.py`, a fail-closed preflight module for a proposed BUY or SELL. It:

- Calculates volume from the member's risk percentage and the broker's own `order_calc_profit` result for one lot between entry and stop loss, so the loss estimate is in the account's deposit currency.
- Rounds volume down to the broker's volume step and rejects trades where the minimum allowed lot would exceed the risk budget.
- Requires the member's new-order permission and risk-controls switch.
- Rejects unconfigured spread/slippage limits, spread above the member's cap, invalid stop/target placement, broker minimum stop distances, disabled symbol/account trading, daily-loss breaches, open-position cap breaches and insufficient free-margin buffer.
- Returns a proposed volume and risk estimate only. It never calls `order_send`.

Unit tests cover sizing, a valid preflight, permission denial, daily-loss denial, zero-spread fail-closed behavior and minimum-lot rejection. GitHub Actions now runs these Python tests alongside the web typecheck/lint/build.

The pending-order execution worker now fetches current risk settings and a fresh server-calculated UTC-day loss figure before final authorization. The daily baseline is accepted only when captured within 30 seconds of UTC midnight and broker deal history is fresh and complete; otherwise execution is blocked for that UTC day. The worker counts all current positions and pending orders conservatively.

## UTC daily equity monitoring foundation (added; not yet execution-grade)

The worker now includes account balance and equity in its authenticated heartbeat. The Edge Function uses its own UTC date and creates one service-only opening snapshot per member/account per UTC day, then updates the latest balance/equity and calculates the percentage change from that day's first observed equity. The heartbeat response includes the observed daily loss percentage for future risk gating.

Important limitations before this can be used to authorize trades:
- The opening baseline is the first successful worker observation that UTC day. If the worker starts late, earlier losses are not included.
- Deposits, withdrawals, credits, corrections, and broker balance operations can distort an equity-only daily change. These must be detected and reconciled from MT5 deal history before automated enforcement.
- The daily snapshot table is service-role only and is not exposed to members.
- Daily snapshots are used by the gated pending-order execution authorization; stale or incomplete snapshots block new orders.

## UTC-day deal-history reconciliation (added; monitoring only)

The Windows worker now queries MT5 deal history from UTC midnight on every heartbeat and reports a compact aggregate:
- balance, credit, charge, correction and bonus operations as a cash-flow adjustment;
- realized trading profit/loss including commissions, swaps and fees;
- deal count, latest deal timestamp and whether the history query completed.

The Edge Function validates these values and updates the service-only daily risk snapshot. It subtracts reported cash-flow adjustments from the observed equity change so deposits, withdrawals and broker balance operations are not mistaken for trading profit or loss. Trading costs remain included in realized trading net. The worker recomputes the full current-day history each heartbeat, so a restart does not double-count deals.

Important limits:
- The daily opening equity remains the first successful observation for that UTC date. If the worker starts late, earlier intraday equity movement and floating P/L changes before that first observation are not reconstructed.
- Deal-history reconciliation improves cash-flow treatment; it does not make the daily loss figure a perfect midnight-to-now mark-to-market measure.
- If MT5 cannot return deal history, the heartbeat fails closed rather than silently reporting a complete history.
- The figures now gate pending-order execution. If the worker starts after the 30-second UTC-midnight baseline window, or history becomes stale/incomplete, new orders are blocked until the next UTC day.


## Persistent MT5 trade inventory (added; read-only)

Successful `list_pending_orders` and `list_positions` sync results are now reconciled into the service-only `mt5_trade_inventory` table. Each record is keyed by member, exact paired MT5 account, object type and broker ticket. It retains the broker identifier, symbol, side/type, volume, entry/current price, SL/TP, floating P/L, magic number, broker reason/comment and last-seen sync timestamp.

Ownership is deliberately conservative:
- Every newly discovered object defaults to `discovered_unowned`.
- An object is only labelled `strategy_tagged_unverified` when both the reserved magic number 601025 and the `STAI:` comment prefix match.
- A strategy tag is not proof of ownership and does not grant management permission.
- Existing adoption/management statuses are not overwritten by subsequent inventory refreshes.
- No discovered order or position is modified, cancelled or closed.

The next stage must add an explicit member adoption workflow with a confirmation step, immutable ownership audit and server-side scope checks before any management command can be accepted. Strategy-created orders must carry a unique strategy tag and be reconciled against broker tickets/history before they are considered strategy-owned.


## Explicit MT5 trade adoption (added; permission registry only)

The member dashboard can now load the paired account's persisted trade inventory and explicitly adopt or revoke adoption for one exact broker ticket at a time.

- Pending-order adoption requires the separate `adopt_pending_orders` permission.
- Position adoption requires the separate `manage_existing_positions` permission.
- The service-side database function locks the inventory row, verifies the paired account and permission, changes only the ownership status, and appends an audit record in the same transaction.
- Repeated, stale or conflicting adoption requests are rejected.
- Revoking adoption returns the item to `discovered_unowned`.
- Adoption does not enqueue a worker command and does not modify, cancel, close or otherwise interact with the broker object.
- The inventory list is served only through the authenticated member action and is scoped to the exact account paired to that member.

This is an ownership registry, not an order-management release. Before any broker management is enabled, the worker must revalidate the live ticket against MT5, check the exact adopted status and permission server-side, and restrict the requested action to that ticket. No manual trade is automatically adopted.


## Pending-order broker preflight (dry-run only)

The bridge now accepts an authenticated `preflight_pending_order` request for BUY_STOP, SELL_STOP, BUY_LIMIT and SELL_LIMIT proposals. It checks the member's separate new-order permission, enabled risk controls, configured spread/slippage ceilings and UTC-day risk snapshot before queueing the proposal. The Windows worker then rechecks the exact logged-in account, symbol availability, live bid/ask, broker minimum stop distance, pending-order placement relative to market, current open-position count, broker-calculated risk volume and margin buffer.

A successful result is a broker-side dry-run approval only. The member-facing proposal/status panel now supports a separate confirmation that queues a pending order. The worker performs final server authorization, broker order_check and order_send; it persists a dispatch attempt before send and reconciles by a unique broker comment. Ambiguous outcomes are marked uncertain and never blindly resent. This path still requires deployment and real broker end-to-end testing; automatic signal-to-order execution is not included.


## Controlled pending-order execution (added; broker testing required)

The bridge now has a controlled pending-order execution path for member-approved BUY_STOP, SELL_STOP, BUY_LIMIT and SELL_LIMIT orders. This is not unattended signal automation: the member submits a proposal, the connected worker performs a dry-run broker preflight, and the member must separately confirm the exact order in the dashboard.

Before a worker can call MT5 order_send, all of the following must pass:
- The member's separate new-order permission, risk-controls switch and live-execution switch are enabled, and the emergency stop is off.
- The member explicitly approves a successful dry-run proposal. The approval is single-use per preflight proposal and is bound to the currently paired worker.
- The server rechecks the exact account, worker heartbeat, UTC-day risk snapshot and deal-history freshness at dispatch time and again immediately before send.
- Daily baseline must have been captured within 30 seconds of UTC midnight and full broker deal history must be available and current. If the worker missed that opening window, new execution is blocked for that UTC day rather than guessing the missing loss.
- The worker verifies the currently logged-in account, terminal algorithmic-trading permission, symbol trading mode, live bid/ask, pending-order geometry, broker stop distance, spread, daily loss, maximum positions including existing pending orders, risk-based volume, margin and broker order_check.
- The server persists a dispatching attempt before order_send. The broker request carries magic 601025 and a unique STAI comment. If the worker restarts after a send attempt, it reconciles live orders and broker history by that comment. If the result cannot be established, it marks the attempt uncertain and never blindly resends it.

The worker only places pending orders from this explicitly confirmed dashboard workflow. It does not yet convert live AI signals into unattended MT5 orders, manage existing positions, trail stops, close positions or cancel pending orders. A successful API/build test is not a broker integration test. Before enabling a live account, deploy the migration and Edge Function, install the updated worker on the member's private Windows host, verify the exact account identity and complete a broker end-to-end test. Demo or live account choice remains with the member; no demo-only restriction is imposed.
