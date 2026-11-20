# SuperTech AI Trader — execution and AI architecture

## Product contract

The phone app is the member's command centre. A centrally operated market-intelligence service can monitor supported markets, but each member's MT5 terminal/worker and execution permissions remain isolated. Members do not enter broker passwords into the app.

## Signal lifecycle

1. Market data is normalized by symbol and candle timestamp.
2. The strategy evaluates a closed H4 candle and its configured evidence.
3. M15 confirmation is evaluated against the H4 direction. A signal is not confirmed merely because an intrabar price touched a level.
4. A canonical signal is written once to `trader_signal_intents`, keyed by a stable `signal_key`. Replays must resolve to the same row.
5. For each paired member, a separate execution decision is created in `trader_member_execution_intents`. The decision snapshots account permissions and risk inputs at evaluation time.
6. The policy evaluator must fail closed if the account is not connected, emergency stop is on, live execution is off, new-order permission is off, risk controls are off, risk baselines are missing/stale, spread/slippage limits are unavailable, or any configured risk limit is exceeded.
7. Only an approved decision may create an idempotent bridge command. The worker independently validates account identity, current broker state, volume, price geometry and protective SL/TP before sending.
8. After a timeout or worker restart, reconcile broker order/deal history by the unique SuperTech AI broker comment. Never blindly resubmit an uncertain send.
9. Position management may touch only strategy-owned positions with a verifiable SuperTech AI ownership marker. Manual member trades are out of scope unless separately and explicitly adopted.

## AI companion boundaries

The AI service may:
- summarize verified market and account facts;
- explain why a signal is confirmed, waiting or invalidated;
- explain risk blocks in ordinary language;
- summarize completed strategy-owned trades and journal patterns;
- answer questions using only the authenticated member's permitted data.

The AI service may not:
- invent prices, signals, account balances or execution status;
- issue broker commands or approve its own proposals;
- override deterministic policy, emergency stop, account permissions or broker validation;
- access another member's account or worker credentials;
- present uncertain or stale information as current.

Responses should include a concise source/time context and explicitly say when evidence is missing or stale. Structured policy results—not LLM text—determine whether execution is permitted.

## Rollout gates

- Keep the migration unapplied to production until reviewed and tested against the actual Supabase schema.
- Implement signal ingestion and member policy evaluation before worker auto-execution.
- Run full demo-account tests, including duplicate delivery, partial broker response, network loss, worker restart, rejected orders, stop-loss/take-profit verification and emergency stop.
- Live trading remains disabled until a separate explicit owner/member authorization and a verified demo sign-off.


## Deterministic policy evaluator

A pure evaluator and focused Deno tests now live in `supabase/functions/_shared/signal-policy.ts` and `signal-policy.test.ts`. It requires closed H4 and M15 candles, fresh signal timestamps, correct BUY/SELL price geometry, a paired member, a fresh worker heartbeat, explicit live/new-order permissions, emergency stop off, symbol allow-list approval, current daily risk baseline/history, and bounded risk settings. It returns a reason-coded allow/deny decision only. It does not create bridge commands and is not yet connected to the execution path. A passing decision never replaces the existing bridge and worker's independent broker-side checks.
## Trusted signal ingestion

The `trader-signal-ingest` Edge Function accepts POST requests only from the trusted signal producer using a separately configured `SIGNAL_INGEST_SECRET` (minimum 32 characters). It validates the stable signal key, symbol, direction, fresh timestamp, price geometry, closed-candle flags and bounded evidence. It stores a canonical H4/M15 record and returns an existing record for duplicate keys. Incomplete candle/confirmation evidence is stored as `observed`, never `confirmed`. This endpoint does not evaluate member accounts and never creates MT5 bridge commands. Configure the secret only in the function's server-side secrets before any deployment; never expose it in the app or client bundle.
