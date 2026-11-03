# MT5 execution bridge — implementation contract

## Current delivery boundary

The web app is a React/Vite client with Supabase authentication, database and Edge Functions. It does not contain a running MetaTrader 5 terminal or a broker execution process. A browser-only login form cannot execute MT5 orders.

The MT5 dashboard entry is intentionally a setup foundation. It does not claim a broker connection, accept credentials while the bridge is offline, or place trades. The UI explicitly tells members not to enter or send MT5 credentials until the secure bridge is deployed.

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
- The bridge command queue, worker registry and execution audit tables are service-role-only. They provide the persistence foundation for a future worker, not a running worker or broker connection.
- The dashboard deliberately blocks credential entry while the bridge is offline.
- No MT5 order can be placed by this repository state yet. Credential enrollment, worker pairing, secret-vault integration, command processing, broker connectivity, and end-to-end execution tests remain required.

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

The function is a command transport only. It does not log in to a broker, store MT5 passwords, create trades, or execute order commands. No command should be enqueued for trade execution until the credential vault, broker session, account authorization, risk checks, reconciliation and worker execution implementation are deployed and tested.

## Pending limit-order momentum filter

The existing signal-generation and reversal rules are unchanged. The added quality gate applies only to educational Buy Limit and Sell Limit ideas in `src/lib/pendingOrders.ts`; Buy Stop and Sell Stop generation is deliberately left on its previous path.

A limit idea is shown only when all of these checks pass:

- The latest confirmed M5 signal is active, fresh (no older than six M5 bars), and points in the same direction as the existing eight-timeframe agreement.
- At least four of the latest five closed M5 candle bodies point in the intended direction.
- The five-candle directional move is efficient (not choppy), candle bodies make up at least half of the total candle range, and the net move is at least 0.3 of the M5 rolling standard deviation.
- The trained historical-outcome model can score the M5 signal and returns at least 70/100.

If the model is not trained sufficiently, or any M5 condition fails, the limit idea is withheld. This is intentionally conservative: it can reduce the number of limit ideas, and it does not guarantee profitable fills. The UI displays the M5 AI score and momentum score on approved limit ideas.

## Windows read-only worker and member pairing (added)

The repository now includes `mt5-worker/`, a Windows Python worker that connects to an already logged-in MetaTrader 5 desktop terminal. It supports both demo and live accounts and deliberately has no broker-password input or order-send implementation.

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
