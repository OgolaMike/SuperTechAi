# SuperTech AI — Full Platform Experience Transformation

**Product promise:** Be part of the AI revolution.  
**Experience standard:** Deliver a coherent, dependable, personal trading ecosystem that feels worth far more than a collection of disconnected tools. The $5,000-class standard describes member value and experience, not company valuation or a financial return promise.

## Mission

Bring the existing SuperTech AI capabilities together around the member journey: understand the market, discover a setup, assess risk, decide or automate execution, track the result, learn, and improve. Preserve working production behaviour while upgrading the experience in small, testable releases.

## Current repository / backend baseline

This plan starts from main commit `eb8ec0465ab70cd542beb7368fceb3409494fb2d` (Personal AI companion PR #93).

The application already contains substantial capabilities and backend structures, including:
- Deriv signal monitoring, signal records, multi-timeframe intelligence, Super Signals, Break & Retest, pending-order ideas and alerts.
- Crypto market movers and Binance / OKX automation areas.
- MT5 and cTrader connection / execution foundations.
- Member alerts, push-event infrastructure, member access, referrals/finance and owner governance.
- Academy videos and AI Academy-related tables.
- A Personal AI companion screen and a `personal-ai` Edge Function integration.

The live database currently contains material trading and member data. Existing public-schema tables are RLS-enabled. The project has 356k+ signal records and 180k+ push events, so migrations and performance changes must be measured and conservative.

Known limitations in the current Personal AI screen:
- Member goal is stored in browser localStorage, not synced across devices.
- Chat history exists only in component state and is lost when the screen/session resets.
- The UI currently labels the companion “Live AI” without checking backend/model health.
- The companion receives a limited client-provided context; trusted server-side trade/performance context and persistent member memory are not yet established by this audit.

## Product pillars and acceptance criteria

### 1. Member home and navigation
- Present a concise daily overview: feed health, market focus, meaningful opportunities, open/active trade state where available, and next best action.
- Keep advanced controls available without exposing indicator jargon by default.
- Maintain consistent responsive behaviour on mobile and desktop.
- Load the useful shell first; defer noncritical sections and expensive data.

**Acceptance:** no fabricated stats; loading, empty, stale and error states are explicit; key actions are reachable on mobile and desktop.

### 2. Dual-engine trading intelligence
- Preserve independent M1 and higher-timeframe engines; do not collapse them into one strategy.
- Explain when engines agree, disagree, or when M1 is acting alone.
- Make strategy, timeframe, symbol, candle-close and invalidation rules explicit.
- Evaluate each engine separately using historical/out-of-sample evidence before claiming an edge.

**Acceptance:** deterministic tests for signal rules; no look-ahead; candle-close integrity; performance reports include sample size, costs/slippage assumptions and drawdown, not win rate alone.

### 3. Signal and trade journey
- Standardize signal cards, chart snapshots, entry/stop/target display, alert states and lifecycle.
- Explain why a setup appeared, what would invalidate it, and what confirmation is still missing.
- Record signal-to-trade outcomes and reversals accurately.
- Keep analysis signals distinct from broker-executed orders.

**Acceptance:** one traceable signal lifecycle; no duplicate alerts/orders; stale signals are visibly stale; no guaranteed-profit language.

### 4. Personal AI companion
- Add opt-in, private, reviewable member memory with edit/delete controls.
- Persist goals and conversation history only after schema, retention and privacy rules are defined.
- Use trusted backend context for member trade history and performance; never trust client-supplied ownership or privileged account data.
- Replace hardcoded “Live AI” with actual health/availability status.
- Provide clear limitations, safe guidance and no autonomous order placement from chat.

**Acceptance:** strict per-user access controls and RLS tests; graceful fallback when model service is unavailable; member can inspect and clear stored memory.

### 5. Automation and risk controls
- Unify account connection status, permissions, order intents, execution events and positions across supported brokers/exchanges where practical.
- Make automation opt-in, account-specific and visibly controllable.
- Add pre-trade limits, daily loss limits, duplicate protection, idempotency, execution reconciliation and an emergency pause.
- Never expose credentials to the browser or store secrets in client-readable tables.
- Keep signal generation separate from execution authorization.

**Acceptance:** sandbox/test coverage for duplicate, timeout, partial-fill, rejected-order and reconnect scenarios; explicit audit trail; no “live” badge without verified connection and worker health.

### 6. Performance and learning
- Show verified trade and strategy performance with transparent definitions.
- Add a personal journal and AI coaching based on actual recorded outcomes.
- Keep educational explanations simple, actionable and linked to relevant Academy lessons.

**Acceptance:** metrics reconcile to source records; incomplete data is labelled; AI does not invent results or infer unrecorded trades.

### 7. Academy and member support
- Deliver a coherent learning path, current-screen walkthroughs, AI tutoring and member progress.
- Ensure published video/tutorial content matches the current UI.
- Provide reliable help and account-recovery paths; retain email verification and recovery.

**Acceptance:** every published lesson has an owner, current version and tested playback; verification is not weakened.

### 8. Membership, payments and owner operations
- Keep member access, pricing, payment status, referral attribution and owner finance auditable.
- Respect existing member terms and the agreed $300 promotional / $500 standard membership positioning; $500 includes automation.
- Do not infer payment success from a client redirect or editable profile field.

**Acceptance:** payment webhooks are verified server-side; entitlement changes are audited; referral and ledger totals reconcile.

### 9. Reliability, security and visual quality
- Improve startup, dashboard rendering and navigation without removing existing functionality.
- Monitor market feeds, AI, push, broker workers and database health.
- Run security/performance advisors after relevant schema changes.
- Use a consistent premium visual system, accessible controls, reduced-motion support and robust phone/landscape layouts.

**Acceptance:** build/typecheck/lint and focused tests pass; no secrets in frontend; RLS policies reviewed; deployment is separately verified after release.

## Delivery sequence

### Phase 0 — Baseline and safety (this change)
1. Record the current repository and Supabase baseline.
2. Map each user-facing module to its data source, Edge Function, background worker and deployment dependency.
3. Identify broken, duplicate, stale or unverified experiences before replacing anything.
4. Establish regression checks for auth, signal generation, alerts, account connections, Academy, finance and navigation.

### Phase 1 — Trustworthy member experience
1. Remove misleading hardcoded health labels.
2. Standardize empty/loading/stale/error states and member-facing language.
3. Improve home dashboard hierarchy and section navigation.
4. Add cross-device personal goal and private AI memory only with RLS and explicit member controls.

### Phase 2 — Unified signal-to-outcome journey
1. Align M1 and higher-timeframe explanation and confluence display.
2. Standardize signal lifecycle and chart snapshots.
3. Reconcile signal history with actual broker/exchange execution records.
4. Add transparent performance and journal views.

### Phase 3 — Safe automation
1. Audit broker/exchange adapters and worker health.
2. Unify account state and execution observability.
3. Test safeguards, idempotency, reconciliation, risk caps and emergency pause.
4. Release automation capabilities behind explicit member permissions and plan entitlements.

### Phase 4 — Personal learning and proactive intelligence
1. Add personalized briefings based on trusted current data.
2. Link signals, trade outcomes and Academy lessons.
3. Add opt-in notifications with quiet hours and user controls.
4. Introduce coaching only where evidence and member history support it.

### Phase 5 — Scale and polish
1. Profile startup, database queries, feed subscriptions and large histories.
2. Optimize with measured indexes/caching/pagination; do not remove indexes based only on “unused” reports without workload review.
3. Validate mobile, tablet and desktop.
4. Verify production deployment, monitoring and rollback path.

## Non-negotiable safeguards

- Existing Supabase remains the active backend; no Cloudflare/Neon migration in this programme.
- Keep email verification and recovery enabled.
- Preserve existing member data, finance records and broker credentials.
- No destructive schema/data changes without explicit review.
- No unverified profitability, signal accuracy or “AI understands everything” claims.
- No production deployment claim until the existing Bolt deployment is updated and smoke-tested.
- Each phase ships as a focused PR with tests and a clear rollback path.

## First implementation priorities

1. Build an accurate capability/dependency inventory from the source and deployed backend.
2. Fix the Personal AI health indicator and error/empty states.
3. Design and implement private, opt-in member memory with RLS and user controls.
4. Add a reliable member home overview using existing verified data.
5. Continue into signal lifecycle, execution reconciliation and performance.

This document is the programme baseline, not a claim that all phases are already implemented.
