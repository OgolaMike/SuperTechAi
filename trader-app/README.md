# SuperTech AI Trader

A separate, phone-friendly MT5 account and worker control application in the SuperTechAi repository.

## Product experience: the AI layer

The product direction is a calm, account-aware AI trading companion—not a chat box that makes trades on its own.

Planned capabilities:
- **Personal market briefing:** summarize multi-market conditions and highlight only markets worth attention.
- **Explainable signal cards:** translate H4-led opportunities and lower-timeframe confirmation into plain language, with entry area, invalidation and reasons to wait.
- **Risk guardian:** explain exposure, daily loss, position limits, spread/slippage and why an order is blocked.
- **Trade memory and coaching:** searchable trade journal, outcome summaries and evidence-based performance feedback.
- **Natural-language copilot:** answer questions using the signed-in member's own account and approved data only.
- **Central intelligence, individual execution:** scan supported broker markets centrally while each member's MT5 account remains separately paired and permissioned.

The UI currently previews these capabilities as planned product features. It does not pretend that an LLM service, market briefing, voice assistant or autonomous strategy is already connected.

### Non-negotiable AI and execution boundary

AI may summarize, explain and propose. It must never bypass deterministic server-side risk checks, member permissions, idempotency, broker-side validation or the emergency stop. AI-generated text is not an execution authorization. Every trade must be traceable to a validated signal intent and a member-specific approval/automation policy.

## Current implemented scope

- Supabase email/password sign-in and account creation (email verification remains enabled).
- Member-owned MT5 account pairing through the existing `mt5-bridge` Edge Function.
- One-time worker token display and copy; the raw token is not persisted by this app.
- Member-scoped MT5 account status and clear worker-installation instructions.
- AI experience roadmap preview in the signed-in dashboard.
- No broker password collection, no service-role key, no unattended/live order controls.

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

## Engineering progress

- Added `trader_signal_intents` and `trader_member_execution_intents` as a new, service-role-only migration. It is deliberately not applied to the existing Supabase project by this PR.
- Signal identity is globally idempotent; member execution decisions are separately idempotent per account and signal.
- The schema records H4 as the primary timeframe and M15 as the confirmation timeframe, with evidence, explanation and risk/policy snapshots.
- Inserts into these tables do not create MT5 bridge commands. All account permissions still default to fail-closed and existing live-execution flags are untouched.

## Next engineering stages

1. Implement the server-side signal ingestion/validation service that writes canonical H4 signals only after M15 confirmation evidence is available.
2. Implement the member policy evaluator that creates blocked/approved decision records, and only then queues a bridge command when the member's permissions, risk controls, worker health and emergency-stop state all pass.
3. Extend the Windows worker for unattended strategy-owned order execution, protective SL/TP verification, restart reconciliation and position management. Keep it isolated from manual trades.
4. Add a grounded AI service for market briefings, signal explanations, risk explanations and journal insights. AI output remains advisory and cannot authorize or submit orders.
5. Demo end-to-end tests for duplicate signals, BUY/SELL, rejected orders, disconnect/restart, SL/TP, risk limits and emergency stop.

Demo end-to-end testing is mandatory. Never enable live execution as part of deployment or CI.
