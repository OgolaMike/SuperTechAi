# SuperTech AI MT5 Windows Worker

This worker supports read-only account synchronization plus explicitly member-approved pending-order placement. It does not accept broker passwords, manage existing positions, trail stops, cancel pending orders or close trades.

## Requirements

- Windows 10/11 or Windows Server.
- Python 3.11 (64-bit).
- MetaTrader 5 desktop terminal installed.
- A member-selected broker account already logged into that terminal.
- The deployed SuperTech AI Supabase Edge Function and a worker ID/token created from the app's MT5 Auto Trading page.

Both demo and live terminal accounts are accepted. The worker reports the
terminal's actual account/server identity; it does not force demo mode.

## Install

Open PowerShell in this folder:

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

First create the pairing from the signed-in SuperTech AI app: enter the MT5
account number and exact server, then copy the one-time worker token. Paste
that token only into the hidden prompt below. The token is stored using Windows
Credential Manager through Python keyring, not in a source file or ordinary
environment variable. Re-pairing revokes previously issued worker tokens.
Do not paste tokens into chat, GitHub, screenshots or command-line arguments.

Optional terminal path:

```powershell
$env:STAI_MT5_TERMINAL_PATH = "C:\Program Files\MetaTrader 5\terminal64.exe"
```

The MT5 terminal must be installed and logged into the exact account the member
intends to connect. Do not add the trading password to this worker's settings.
If the account changes, verify the login and broker server shown in the account
snapshot before authorizing any future trading capability.

## Commands currently supported

- `sync_account`
- `list_pending_orders`
- `list_positions`
- `preflight_pending_order` (dry-run only)
- `place_pending_order` (only after member confirmation and final server/broker checks)
- `pause_trading` (no-op acknowledgement; the server-side emergency-stop flag blocks new submissions)

The worker only places BUY_STOP, SELL_STOP, BUY_LIMIT and SELL_LIMIT proposals confirmed by the member in the dashboard. It never places market orders or adopts, modifies, cancels or closes existing trades. Reading a manual trade is not permission to manage it.

## Current limits

Execution is fail-closed unless the member enables new-order permission, risk controls and the separate live-execution switch, and turns off the emergency stop. The server requires a UTC-day equity baseline captured within 30 seconds of midnight and fresh full deal history; if that is missing, execution is blocked for the day. Each proposal needs a successful dry-run and a separate confirmation. A persisted dispatch attempt and unique broker comment prevent blind duplicate resubmission after a restart; ambiguous outcomes are marked uncertain for manual broker review. This local-terminal design does not require SuperTech AI to collect or centrally store broker passwords. Do not run this on a shared/untrusted Windows machine.


## Controlled pending-order execution

1. Deploy the new migration and updated `mt5-bridge` Edge Function.
2. Install the updated worker files and dependencies on the same private Windows PC/VPS as the logged-in MT5 terminal.
3. Keep the worker running continuously across UTC midnight so the daily equity baseline is captured at the start of the day.
4. In the app, verify the exact account and broker server. Configure broker-appropriate spread/slippage caps, enable risk controls, enable new-order permission, enable live execution and turn off the emergency stop only when ready.
5. Submit a pending-order proposal, wait for the worker's successful dry-run, review the exact symbol/entry/SL/TP and separately confirm the order.
6. Verify the broker ticket in MT5 and refresh the app's order inventory.

The first release is member-confirmed pending orders only. Automatic execution from SuperTech AI signals, position management, trailing stops and order cancellation are not included in this stage. Do not assume a GitHub green check proves the broker accepted an order. Start with the smallest risk you can tolerate and verify every first broker submission.
