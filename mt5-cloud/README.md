# SuperTechAi Trader — Cloud MT5 pilot

This package prepares a Windows VPS to host the existing SuperTech AI MT5 bridge worker. It reuses the deployed mt5-bridge Edge Function, one-time worker credentials, heartbeat, command lease, audit trail, risk preflight and duplicate-send safeguards.

## Important delivery boundary

This is the cloud-host preparation and single-account pilot, not a claim that unattended multi-member MT5 hosting is already live. The current worker attaches to one installed MT5 terminal per worker process. The member's MT5 account must first be authorised in that terminal. For this pilot, the member can use Windows Remote Desktop from a PC or Android device to log into their isolated terminal, then disconnect while the VPS remains online.

MT5 does not provide a universal broker OAuth flow. Do not collect broker passwords in ChatGPT, GitHub, ordinary web forms, app logs or Supabase tables. The member enters their own broker credentials directly into the official MT5 terminal on the secured VPS. The existing worker stores only its separate bridge token in Windows Credential Manager.

A future seamless in-app authorisation flow needs a reviewed encrypted credential-delivery design, private-key management, per-member terminal orchestration, subscription enforcement and multi-tenant isolation. Do not enable that by storing broker passwords in database rows.

## VPS target

- Windows Server 2022 or a supported Windows Server release
- 4 vCPU and 8 GB RAM minimum for a small pilot
- 50 GB free SSD space minimum
- RDP access protected by strong unique credentials and MFA at the provider/account level where available
- One isolated MT5 terminal directory and one worker process per member account
- Monthly billing for the pilot; do not prepay annually before broker latency and reliability tests

One 4-vCPU/8-GB server is a starting pilot, not a promise of unlimited terminals. Monitor RAM, CPU, terminal count, broker latency and worker heartbeats before adding accounts.

## Pilot setup

1. Provision the Windows VPS. Do not put provider passwords or private keys in this repository.
2. Clone/download the SuperTech AI repository onto the VPS.
3. Open an elevated PowerShell window and run mt5-cloud/check-host.ps1.
4. Install the broker's official MT5 terminal into a dedicated folder for the member. Do not share terminal data folders between members.
5. Sign in to that terminal using the member's own MT5 credentials through the official terminal UI. Confirm the exact broker server and account number. Never use an investor/read-only password for trading.
6. In SuperTech AI, the signed-in member pairs their MT5 account and receives a one-time bridge worker ID/token. Transfer these only through the secure RDP session, never through chat or screenshots.
7. Run mt5-cloud/register-worker.ps1 for that member. It copies the worker package into an isolated directory, stores the bridge token in Windows Credential Manager using the existing hidden prompt, and registers a Task Scheduler logon task.
8. Keep the VPS online and the MT5 terminal running. Disconnecting RDP does not intentionally stop the session; verify the terminal and worker remain active after disconnect.
9. Confirm the app shows a fresh worker heartbeat and correct broker account identity. Start with a demo account. Leave live execution and unattended execution disabled until end-to-end demo tests pass.

## Register one account worker

Run from the repository root in elevated PowerShell:

    .\mt5-cloud\register-worker.ps1 -MemberKey "member-01" -WorkerId "WORKER_ID_FROM_PAIRING" -BridgeUrl "https://YOUR_SUPABASE_PROJECT_REF.supabase.co" -TerminalPath "C:\MT5\member-01\terminal64.exe"

The script prompts for the one-time worker token with hidden input. It does not accept a token as a command-line argument. Then log into the terminal interactively before starting the scheduled task.

## Operations

- Check status in the SuperTech AI MT5 page; the worker heartbeat is the source of connection status.
- Use the app emergency stop before maintenance.
- Do not restart or replace a terminal while a broker order send is in an uncertain state.
- After VPS reboot, sign in via RDP, confirm MT5 is logged in, and start the account worker task if it has not started.
- Keep Windows Update, Defender, firewall and RDP security current.
- Back up configuration and audit data, never raw worker tokens or broker passwords.
- Scale by adding resources or separate VPS instances only after measuring the actual terminal workload.

## Current trading scope

The repository worker supports account snapshots, open-position/pending-order inventory, broker-side pending-order dry-run preflight and explicitly confirmed pending-order submission. It is not yet a fully unattended signal execution engine and does not yet implement all automatic position management, staged trailing stops, or automatic closing. Those features require a separately tested strategy-intent dispatcher and broker-side management commands.

The $9/month SuperTechAi Trader plan is currently a displayed product price. Do not represent recurring billing or entitlement enforcement as active until payment webhooks and server-side subscription checks are connected and tested.
