# SuperTech AI MT5 Windows Worker

This is the first executable worker release. It is deliberately **read-only**:
it can verify the logged-in terminal, report account details, list pending
orders and list open positions. It cannot place, edit, cancel or close trades.

## Requirements

- Windows 10/11 or Windows Server.
- Python 3.11 (64-bit).
- MetaTrader 5 desktop terminal installed.
- A member-selected broker account already logged into that terminal.
- The deployed SuperTech AI Supabase Edge Function and a provisioned worker ID/token.

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

The token prompt is hidden. It is stored using Windows Credential Manager
through Python keyring, not in a source file or ordinary environment variable.
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
- `pause_trading` (read-only acknowledgement)

All other commands fail closed. This worker does not adopt, modify, cancel or
close existing trades. Reading them is not permission to manage them.

## Current limits

The repository still needs a credential-enrollment/secret-vault service,
member pairing UI, account ownership verification, broker execution policy,
risk engine, order reconciliation and end-to-end tests before trade execution
can be enabled. Do not enable trade commands or send trading commands to this
worker. Do not run this on a shared/untrusted Windows machine.
