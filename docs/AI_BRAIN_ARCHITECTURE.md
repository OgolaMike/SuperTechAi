# SuperTech AI Brain

## Product decision

SuperTech AI owns the intelligence experience and orchestration layer. It is not a Grok clone and it is not a chat widget. The AI Companion is the conversational interface; the SuperTech AI Brain is the shared intelligence service used by every module.

The model provider is replaceable. xAI/Grok may be selected as a provider, but Grok is not the product identity or the architecture. Provider choice must be configured server-side and never exposed as a browser API key.

## Architecture

1. **Experience layer** — module-specific surfaces in Dashboard, Super Signals, Crypto, Deriv, Analysis, Automate, Account, Services, Academy, Business and AI Companion.
2. **Context layer** — builds a least-privilege context packet from the signed-in member, current module, selected asset, live market snapshot, signal/strategy state, automation health, learning progress and business/referral data. Each module supplies only the context it is authorized to read.
3. **Brain orchestrator** — classifies intent, selects a task, retrieves relevant context, invokes the configured model provider, validates structured output and returns a concise answer plus suggested next action.
4. **Tools layer** — read-only tools first: explain signal, summarize market, inspect strategy results, explain automation health, tutor lesson, summarize referral/business metrics. Trading execution, payments, account changes and referral payouts are never model-authorized tools.
5. **Memory layer** — opt-in, member-scoped preferences and durable facts, with explicit controls to inspect, correct and clear. Do not persist secrets, broker keys, payment credentials or raw sensitive account data in model prompts.
6. **Telemetry and evaluation** — request IDs, latency, provider/model, tool calls, errors, user feedback and groundedness checks. Do not log secrets or full private conversations by default.

## Provider contract

Use a server-side OpenAI-compatible chat interface with provider configuration held in Appwrite Function environment variables:
- `AI_PROVIDER` (for example `xai`)
- `AI_BASE_URL`
- `AI_MODEL`
- `AI_API_KEY`
- `AI_MAX_OUTPUT_TOKENS`

The client calls the authenticated Appwrite Function; it never calls xAI/OpenAI directly. The function verifies the Appwrite session, applies per-user rate limits, enforces input/output size limits, and returns a typed response. Missing provider configuration must produce a clear `AI_NOT_CONFIGURED` status, never a fake answer.

## Common request/response contract

Request:
```ts
type BrainRequest = {
  module: 'dashboard' | 'signals' | 'crypto' | 'deriv' | 'analysis' |
    'automation' | 'account' | 'services' | 'academy' | 'business' | 'companion';
  task: string;
  message?: string;
  context?: Record<string, unknown>;
  conversationId?: string;
};
```

Response:
```ts
type BrainResponse = {
  answer: string;
  summary?: string;
  insights?: Array<{ title: string; detail: string; confidence?: number }>;
  suggestedActions?: Array<{ label: string; action: string }>;
  sources?: Array<{ type: string; id: string; label: string }>;
  requestId: string;
  provider: string;
  model: string;
};
```

The function must reject unknown module names, sanitize untrusted text, cap context size and validate output before returning it. A response must distinguish observed facts, model interpretation and uncertainty.

## Module capabilities and acceptance criteria

| Module | Brain capability | Acceptance test |
|---|---|---|
| Dashboard | Personalized live market briefing, selected-asset explanation, next focus | Briefing references the current selected asset and timestamped live context; no invented prices |
| Super Signals | Explain H4 trigger, timeframe confluence, grade, Entry/TP/SL and invalidation | Every numeric level is sourced from the signal payload; never changes the signal |
| Crypto | Explain movers, momentum, volatility and watchlist relevance | Uses current retrieved market data and labels stale/missing feeds |
| Deriv | Explain synthetic-market behavior, contract mechanics and setup context | No fabricated quote or contract availability |
| Analysis | Compare independent strategies and summarize actual outcomes | Uses recorded results; separates backtest/history from live performance |
| Automate | Explain connection state, execution events, rejects and risk checks | Read-only by default; never submits or modifies an order |
| Account | Explain membership, settings and account activity | Only data belonging to the authenticated member |
| Services | Contextual service discovery and guided support | Recommendations link to real enabled services |
| Academy | Adaptive tutor, lesson summaries, quizzes and learning plan | Tracks learning only with member consent; feedback adapts next lesson |
| Business | Explain referral links, team structure, commissions and payment status | Uses ledger-backed values; never calculates or promises unposted earnings |
| AI Companion | Cross-module conversation and opt-in continuity | Carries approved context across modules without leaking another member's data |

## Trading and financial safety

- The Brain is advisory. Strategy engines remain deterministic and authoritative for signals.
- AI cannot invent or alter entry, stop, target, position size, risk limits or broker execution status.
- No model-generated output may directly trigger a broker order, transfer, withdrawal, payment, commission posting or account permission change.
- Automation safety checks and broker responses remain authoritative; AI may explain a failure but cannot override it.
- Label uncertainty. Never describe a probability as a guarantee or a signal as certain profit.

## Rollout gates

1. Implement and deploy the authenticated Appwrite Function and provider secret configuration.
2. Add shared typed client and context adapters, starting with Companion and Dashboard.
3. Add the same Brain surface to every module using the acceptance criteria above.
4. Add opt-in memory and cross-module context with per-member authorization tests.
5. Add rate limits, timeout/retry behavior, provider fallback policy, observability and prompt-injection tests.
6. Run module-by-module integration tests and verify on mobile before declaring AI-everywhere complete.

## Current implementation status

This document defines the product architecture and acceptance contract. It does not claim the Appwrite Function, model credentials, provider connection, module adapters or production deployment already exist. Those require implementation, Appwrite project configuration and live verification.
