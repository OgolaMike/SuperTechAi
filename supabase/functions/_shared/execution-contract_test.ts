import {
  assertExecutionIntent,
  canTransitionExecutionState,
  executionIdempotencyKey,
  type ExecutionIntent,
} from "./execution-contract.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectThrow(run: () => unknown, expected: string) {
  try {
    run();
  } catch (error) {
    assert(error instanceof Error && error.message === expected,
      `expected ${expected}, received ${String(error)}`);
    return;
  }
  throw new Error(`expected ${expected} to be thrown`);
}

const validIntent = (): ExecutionIntent => ({
  schemaVersion: 1,
  intentId: "8b3d1c2a-1f4e-4a6b-9c8d-7e6f5a4b3c2d",
  idempotencyKey: "stai:binance_futures:conn-1:8b3d1c2a-1f4e-4a6b-9c8d-7e6f5a4b3c2d",
  userId: "user-1",
  provider: "binance_futures",
  connectionId: "conn-1",
  providerAccountId: "account-1",
  environment: "demo",
  strategyId: "super-signal",
  strategyVersion: "1",
  signalId: "signal-1",
  signalCreatedAt: "2026-11-11T10:00:00.000Z",
  expiresAt: "2026-11-11T10:30:00.000Z",
  order: {
    instrument: "BTCUSDT",
    side: "buy",
    kind: "market",
    entryPrice: 60000,
    stopLoss: 59000,
    takeProfit: 62000,
    quantity: 0.001,
  },
  risk: {
    maxLossAmount: 1,
    maxLossCurrency: "USDT",
    riskPercent: 0.5,
    maxOpenPositions: 5,
    dailyLossLimitPercent: 2,
    leverage: 3,
  },
  authorization: {
    liveExecutionAuthorized: false,
    emergencyStop: false,
    preflightVerifiedAt: "2026-11-11T09:59:00.000Z",
  },
  createdAt: "2026-11-11T10:00:01.000Z",
});

Deno.test("accepts a well-formed demo execution intent", () => {
  assertExecutionIntent(validIntent());
});

Deno.test("rejects a buy intent with invalid stop-loss geometry", () => {
  const intent = validIntent();
  intent.order.stopLoss = 61000;
  expectThrow(() => assertExecutionIntent(intent), "buy_entry_or_protection_geometry_invalid");
});

Deno.test("rejects live execution without explicit authorization", () => {
  const intent = validIntent();
  intent.environment = "live";
  expectThrow(() => assertExecutionIntent(intent), "live_execution_not_authorized");
});

Deno.test("rejects a stop-limit order without both trigger and limit prices", () => {
  const intent = validIntent();
  intent.order.kind = "stop_limit";
  intent.order.stopPrice = 61000;
  expectThrow(() => assertExecutionIntent(intent), "stop_limit_order_prices_missing");
});

Deno.test("uncertain submissions cannot be retried without broker lookup evidence", () => {
  assert(!canTransitionExecutionState({ from: "uncertain", to: "accepted" }),
    "uncertain -> accepted must require a broker lookup");
  assert(canTransitionExecutionState({
    from: "uncertain",
    to: "accepted",
    evidence: { brokerLookupCompleted: true, brokerOrderId: "broker-123" },
  }), "broker lookup should permit a reconciled transition");
});

Deno.test("protection and reconciliation require explicit evidence", () => {
  assert(!canTransitionExecutionState({ from: "filled", to: "protected" }),
    "filled -> protected must require protection evidence");
  assert(canTransitionExecutionState({
    from: "filled",
    to: "protected",
    evidence: { protectionConfirmed: true },
  }), "confirmed protection should permit protected state");
  assert(!canTransitionExecutionState({ from: "protected", to: "reconciled" }),
    "reconciliation must require a broker lookup");
});

Deno.test("idempotency key is stable for the same provider, account and intent", () => {
  const id = "8b3d1c2a-1f4e-4a6b-9c8d-7e6f5a4b3c2d";
  const first = executionIdempotencyKey("binance_futures", "conn-1", id);
  const second = executionIdempotencyKey("binance_futures", "conn-1", id);
  assert(first === second, "same intent must produce the same idempotency key");
  assert(first === `stai:binance_futures:conn-1:${id}`, "key must include provider/account/intent identity");
});

Deno.test("rejects an unknown runtime order side even when TypeScript types are bypassed", () => {
  const intent = validIntent();
  (intent.order as { side: string }).side = "hold";
  expectThrow(() => assertExecutionIntent(intent), "unsupported_execution_side");
});

Deno.test("rejects an unsupported trading environment", () => {
  const intent = validIntent();
  (intent as { environment: string }).environment = "paper";
  expectThrow(() => assertExecutionIntent(intent), "unsupported_trading_environment");
});

Deno.test("emergency stop blocks demo and live execution alike", () => {
  const intent = validIntent();
  intent.authorization.emergencyStop = true;
  expectThrow(() => assertExecutionIntent(intent), "emergency_stop_active");
});

Deno.test("rejects an intent without an explicit order size", () => {
  const intent = validIntent();
  delete intent.order.quantity;
  expectThrow(() => assertExecutionIntent(intent), "execution_order_size_missing");
});

Deno.test("accepts the same contract for an explicitly authorized live provider intent", () => {
  const intent = validIntent();
  intent.provider = "okx_futures";
  intent.environment = "live";
  intent.authorization.liveExecutionAuthorized = true;
  intent.connectionId = "okx_futures:user-1";
  intent.idempotencyKey = executionIdempotencyKey("okx_futures", intent.connectionId, intent.intentId);
  assertExecutionIntent(intent);
});

Deno.test("rejects a missing preflight verification timestamp", () => {
  const intent = validIntent();
  intent.authorization.preflightVerifiedAt = "not-a-date";
  expectThrow(() => assertExecutionIntent(intent), "execution_preflight_timestamp_missing");
});


Deno.test("accepts a Spot OTOCO limit intent without inventing a daily-loss setting", () => {
  const intent = validIntent();
  intent.provider = "binance_spot";
  intent.environment = "live";
  intent.authorization.liveExecutionAuthorized = true;
  intent.order.kind = "limit";
  intent.order.limitPrice = intent.order.entryPrice;
  intent.risk.riskPercent = 5;
  delete intent.risk.dailyLossLimitPercent;
  delete intent.risk.leverage;
  intent.connectionId = "binance_spot:user-1";
  intent.idempotencyKey = executionIdempotencyKey("binance_spot", intent.connectionId, intent.intentId);
  assertExecutionIntent(intent);
});

Deno.test("Spot risk above its configured five-percent ceiling is rejected", () => {
  const intent = validIntent();
  intent.provider = "binance_spot";
  intent.risk.riskPercent = 5.01;
  expectThrow(() => assertExecutionIntent(intent), "execution_risk_limits_invalid");
});
