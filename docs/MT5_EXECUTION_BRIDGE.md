# SuperTech AI MT5 execution bridge

## Current release — source of truth

SuperTech AI has a Windows MT5 worker and a guarded pending-order execution path. The worker can read account details, pending orders and open positions. It can place BUY_STOP, SELL_STOP, BUY_LIMIT and SELL_LIMIT orders only after a successful broker dry-run, saved member permissions and risk limits, a separate member confirmation, and repeated server-side and broker-side checks.

**This is not yet unattended signal automation.** The app does not currently convert fresh SuperTech AI signals into broker orders automatically. It does not automatically manage open positions, move trailing stops, cancel pending orders or close positions. Existing manual trades are not managed. The adoption feature records member ownership intent but does not yet implement broker-side management.

A private Windows PC or Windows VPS running the official MT5 desktop terminal and the worker is required. The Android app can control the dashboard but cannot host the MT5 worker. Demo and live accounts are both supported; the member chooses the account. SuperTech AI never asks for or stores the broker trading password.

Broker execution is not production-verified until the current database migrations and Edge Function are deployed, the worker is installed on a private Windows host, and a broker end-to-end test succeeds.

## Strategy and signal boundaries

- Browser dashboard and Supabase scanner use eight timeframes: M1, M5, M15, M30, H1, H2, H4 and D1.
- The scanner evaluates confirmed/closed candles and persists signal records with stable signal keys.
- Preserve the existing SMA 60 / Bollinger signal logic, reversal behavior, signal levels and notification timing. Do not change these while implementing the execution bridge.
- Pending-order ideas are currently generated in the app from live dashboard state. They require agreement across all eight timeframes and a fresh active M15 signal.
- The strict M5 momentum and trained-AI quality gate applies to Buy Limit and Sell Limit ideas only. Buy Stop and Sell Stop rules must not be changed by that limit-order filter.
- These browser-generated ideas are not yet a durable unattended signal-to-order feed. A future automation release must move the same decision rules into a server-side, candle-close-driven pipeline and persist each intent idempotently; it must not trust a browser tab to remain open.

## Account pairing and credential handling

The member pairs an account using the MT5 account number and exact broker server. The official desktop terminal must already be logged in to that account.

- The app does not request a broker password.
- Pairing issues a random worker ID and one-time token. Only a SHA-256 token hash is stored in Supabase.
- The raw worker token is stored on the Windows host in Windows Credential Manager via Python keyring.
- Re-pairing revokes previous worker tokens for the member.
- Every heartbeat verifies the actual terminal login and server against the paired account.
- Never paste broker passwords, worker tokens or API secrets into ChatGPT, GitHub, screenshots or ordinary source files.
- Do not run the worker on a shared or untrusted Windows computer.

## Worker setup

Requirements:
- Windows 10/11 or Windows Server.
- Python 3.11, 64-bit.
- Official MetaTrader 5 desktop terminal installed and logged into the intended account.
- Deployed Supabase `mt5-bridge` Edge Function and all MT5 migrations.
- Worker ID and one-time token created in the signed-in app.

From PowerShell in the `mt5-worker` folder:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
$env:STAI_BRIDGE_URL = "https://YOUR_PROJECT_REF.supabase.co"
$env:STAI_WORKER_ID = "YOUR_REGISTERED_WORKER_ID"
python .\provision_token.py
python .\worker.py
```

The provisioning script prompts for the one-time token with hidden input and stores it in the operating-system credential vault. Optional terminal path:

```powershell
$env:STAI_MT5_TERMINAL_PATH = "C:\Program Files\MetaTrader 5\terminal64.exe"
```

Keep MT5 and the worker running continuously. The app's account pairing page displays connection and heartbeat status. An Android-only setup cannot start this worker; use a private Windows computer or Windows VPS.

## Supported worker commands

- `sync_account`: account identity, balance, equity and free margin.
- `list_pending_orders`: read existing pending orders.
- `list_positions`: read existing open positions.
- `preflight_pending_order`: broker-side dry run; does not place an order.
- `place_pending_order`: send one member-approved pending order after final checks.
- `pause_trading`: acknowledgement only; the server emergency-stop flag blocks new submissions.

The worker rejects unknown commands. It does not place market orders or modify, cancel or close existing broker trades.

## New pending-order safety gates

A pending order can be sent only when all of the following are true:

1. The member enabled new-order permission and risk controls.
2. The separate live-execution switch is on and the emergency stop is off.
3. A broker dry-run succeeded and the member separately confirmed that exact proposal.
4. The worker identity, exact account login/server and heartbeat are current.
5. The UTC-day equity baseline was captured within 30 seconds of UTC midnight and broker deal history is complete and fresh. If the worker misses the opening window, execution fails closed for that UTC day.
6. The worker rechecks symbol availability, trading mode, live bid/ask, pending-order geometry, broker stop distance, spread, risk-sized volume, margin and broker `order_check`.
7. The server persists a dispatch attempt before the worker calls `order_send`.

The broker request uses magic number 601025 and a unique `STAI:` comment. After a restart, the worker reconciles live orders and broker history by that comment. An ambiguous result is marked uncertain and is never blindly resent.

Default risk settings in the app are 0.50% maximum planned risk per trade, 2.00% daily loss limit and three concurrent positions. Spread and slippage limits default to zero and must be configured to broker-appropriate positive values before risk controls can pass. A configured limit is not a guarantee of a fill or profit.

## Required next release for full automation

The following work remains before SuperTech AI can autonomously trade signals and manage its own trades:

1. A server-side execution-intent pipeline driven by fresh closed-candle signals, not browser state.
2. Exact reuse of the eight-timeframe agreement, M15 execution trigger and M5/M30 confluence rules, with the M5 momentum/AI filter restricted to limit orders.
3. Durable idempotency across scanner runs, worker restarts and broker reconnects; deduplicate by account, symbol, timeframe/candle epoch, direction and strategy version.
4. Automatic dispatch of qualifying pending-order intents only after the member explicitly enables unattended execution for that account.
5. Strategy-owned order/position reconciliation that never touches unowned manual trades.
6. Position management with the approved staged stop policy, broker freeze/stops-level checks and safe modification idempotency.
7. Pending-order lifecycle handling, reversal policy, emergency pause and auditable cancellation/close actions.
8. Unit, integration and broker end-to-end tests covering duplicate signals, restart during send, disconnections, rejected stops, partial fills, symbol suffixes, daily loss breaches and emergency stop.

No automatic-trading switch should be presented as functional until these items are implemented and tested. A green GitHub build is not proof of broker execution.
