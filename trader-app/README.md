# SuperTech AI Trader

A separate, phone-friendly MT5 account and worker control application in the SuperTechAi repository.

## Current scope

- Supabase email/password sign-in and account creation (email verification remains enabled).
- Member-owned MT5 account pairing through the existing `mt5-bridge` Edge Function.
- One-time worker token display and copy; the raw token is not persisted by this app.
- Member-scoped MT5 account status and clear worker-installation instructions.
- No broker password collection, no service-role key, no automatic/live order controls.

## Local development

From this directory:

```powershell
Copy-Item .env.example .env.local
# Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
npm install
npm run dev
```

Build:

```powershell
npm run build
```

Deploy this directory as the project root for a separate static frontend. The existing SuperTech AI dashboard and production Bolt deployment are not modified.

## MT5 worker

The existing `../mt5-worker` package runs beside the official MT5 desktop terminal on a private Windows host. It authenticates using a one-time worker token stored in Windows Credential Manager. It currently supports account synchronization and member-confirmed pending-order execution only. It does **not** yet execute H4 signals unattended or manage open positions/trailing stops.

Before unattended automation is enabled, implement and test a server-side durable H4 signal-intent pipeline, idempotent execution lifecycle, per-account risk checks, protective SL/TP verification, restart reconciliation, position management and emergency-stop behavior. Demo end-to-end testing is mandatory. Never enable live execution as part of deployment or CI.