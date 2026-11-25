import {
  canTransitionOptionsTrade,
  resolveOptionsBuyTimeout,
  validateOptionsPurchase,
} from "../../../src/lib/optionsTraderLifecycle.ts";
import {
  buildOptionsIdempotencyKey,
  canTransitionOptionsExecution,
  isTerminalOptionsExecution,
  toOptionsTradeStatus,
} from "../../../src/lib/optionsTraderLedger.ts";

function assertEquals<T>(actual: T, expected: T, message = "values differ") {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}
function assertThrows(fn: () => unknown, expectedMessage: string) {
  try { fn(); } catch (error) {
    assertEquals(error instanceof Error ? error.message : "", expectedMessage);
    return;
  }
  throw new Error(`expected error: ${expectedMessage}`);
}

const validGuard = () => ({
  proposal: {
    proposalId: "proposal-123",
    askPrice: 1,
    payout: 1.8,
    spot: 100,
    barrier: "+2.5",
    contractType: "ONETOUCH" as const,
    symbol: "R_100",
    createdAtEpoch: 1_000,
    expiresAtEpoch: 2_000,
  },
  nowEpoch: 1_500,
  accountMode: "demo" as const,
  authorisedAccountMode: "demo" as const,
  accountStatus: "active",
  automationEnabled: true,
  stake: 1,
  configuredStakeLimit: 10,
  availableBalance: 100,
  alreadyPurchasedProposalIds: [] as string[],
  expectedSymbol: "R_100",
  expectedContractType: "ONETOUCH" as const,
});

Deno.test("purchase guard accepts a valid, unexpired demo proposal", () => {
  assertEquals(validateOptionsPurchase(validGuard()), null);
});

Deno.test("purchase guard fails closed when automation is off", () => {
  assertEquals(validateOptionsPurchase({ ...validGuard(), automationEnabled: false }), "automation_disabled");
});

Deno.test("purchase guard rejects account-mode mismatch", () => {
  assertEquals(validateOptionsPurchase({ ...validGuard(), authorisedAccountMode: "real" }), "account_mode_mismatch");
});

Deno.test("purchase guard rejects inactive accounts", () => {
  assertEquals(validateOptionsPurchase({ ...validGuard(), accountStatus: "suspended" }), "account_not_active");
});

Deno.test("purchase guard rejects a different market or contract", () => {
  assertEquals(validateOptionsPurchase({ ...validGuard(), expectedSymbol: "R_50" }), "symbol_mismatch");
  assertEquals(validateOptionsPurchase({ ...validGuard(), expectedContractType: "NOTOUCH" }), "contract_mismatch");
});

Deno.test("purchase guard rejects expired and future-dated proposals", () => {
  assertEquals(validateOptionsPurchase({ ...validGuard(), nowEpoch: 2_000 }), "proposal_expired");
  assertEquals(validateOptionsPurchase({ ...validGuard(), nowEpoch: 900 }), "proposal_expired");
});

Deno.test("purchase guard rejects stakes above configured limits or balance", () => {
  assertEquals(validateOptionsPurchase({ ...validGuard(), stake: 11 }), "stake_out_of_bounds");
  assertEquals(validateOptionsPurchase({ ...validGuard(), availableBalance: 0.5 }), "insufficient_balance");
});

Deno.test("purchase guard rejects non-finite proposal values", () => {
  const guard = validGuard();
  guard.proposal.askPrice = Number.NaN;
  assertEquals(validateOptionsPurchase(guard), "invalid_numeric_value");
});

Deno.test("purchase guard prevents reusing a proposal", () => {
  assertEquals(validateOptionsPurchase({
    ...validGuard(),
    alreadyPurchasedProposalIds: ["proposal-123"],
  }), "proposal_already_purchased");
});

Deno.test("execution idempotency key is stable and separates contract kinds", () => {
  const input = { userId: "user-1", accountId: "VRTC123", signalId: "signal-9", contractKind: "ONETOUCH" as const };
  const first = buildOptionsIdempotencyKey(input);
  assertEquals(buildOptionsIdempotencyKey(input), first);
  assertEquals(buildOptionsIdempotencyKey({ ...input, contractKind: "NOTOUCH" }), "user-1:VRTC123:signal-9:NOTOUCH");
});

Deno.test("execution idempotency key rejects empty or oversized components", () => {
  assertThrows(() => buildOptionsIdempotencyKey({
    userId: "", accountId: "VRTC123", signalId: "signal-9", contractKind: "ONETOUCH",
  }), "invalid_idempotency_key_input");
  assertThrows(() => buildOptionsIdempotencyKey({
    userId: "u".repeat(257), accountId: "VRTC123", signalId: "signal-9", contractKind: "ONETOUCH",
  }), "invalid_idempotency_key_input");
});

Deno.test("execution ledger permits only safe forward transitions", () => {
  assertEquals(canTransitionOptionsExecution("RESERVED", "BUY_SENT"), true);
  assertEquals(canTransitionOptionsExecution("BUY_SENT", "OPEN"), true);
  assertEquals(canTransitionOptionsExecution("OPEN", "WON"), true);
  assertEquals(canTransitionOptionsExecution("WON", "OPEN"), false);
  assertEquals(canTransitionOptionsExecution("REJECTED", "BUY_SENT"), false);
});

Deno.test("unknown executions can reconcile but terminal states cannot reopen", () => {
  assertEquals(canTransitionOptionsExecution("UNKNOWN", "OPEN"), true);
  assertEquals(canTransitionOptionsExecution("UNKNOWN", "LOST"), true);
  assertEquals(canTransitionOptionsExecution("SOLD", "OPEN"), false);
  assertEquals(isTerminalOptionsExecution("WON"), true);
  assertEquals(isTerminalOptionsExecution("UNKNOWN"), false);
});

Deno.test("persisted statuses map to the UI lifecycle", () => {
  assertEquals(toOptionsTradeStatus("RESERVED"), "PURCHASE_PENDING");
  assertEquals(toOptionsTradeStatus("BUY_SENT"), "PURCHASE_PENDING");
  assertEquals(toOptionsTradeStatus("UNKNOWN"), "UNKNOWN");
  assertEquals(toOptionsTradeStatus("OPEN"), "OPEN");
  assertEquals(toOptionsTradeStatus("SOLD"), "SOLD");
});

Deno.test("a buy timeout becomes UNKNOWN and must be reconciled", () => {
  assertEquals(resolveOptionsBuyTimeout(), "UNKNOWN");
});

Deno.test("existing UI lifecycle transitions cannot reopen settled trades", () => {
  assertEquals(canTransitionOptionsTrade("PROPOSED", "PURCHASE_PENDING"), true);
  assertEquals(canTransitionOptionsTrade("OPEN", "WON"), true);
  assertEquals(canTransitionOptionsTrade("WON", "OPEN"), false);
  assertEquals(canTransitionOptionsTrade("UNKNOWN", "OPEN"), true);
});
