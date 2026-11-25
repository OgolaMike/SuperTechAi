import {
  buildThreeHourWickPositionLabel,
  decideThreeHourWickPositionAction,
  isThreeHourWickOwnedLabel,
} from "../../../src/lib/threeHourWickPositionManager.ts";

const intentId = "123e4567-e89b-42d3-a456-426614174000";
const label = buildThreeHourWickPositionLabel(intentId);
const base = {
  brokerPositionId: "987654",
  label,
  direction: "BUY" as const,
  status: "open" as const,
  entryPrice: 100,
  currentPrice: 100.7,
  stopLoss: 98,
  executedAtEpoch: 1_800_000_000,
};

Deno.test("3H Wick ownership requires its exact versioned strategy label", () => {
  if (!isThreeHourWickOwnedLabel(label)) throw new Error("Expected strategy label to be owned");
  if (isThreeHourWickOwnedLabel(`supertech:${intentId}`)) throw new Error("Generic strategy label must not be adopted");
  if (isThreeHourWickOwnedLabel(null)) throw new Error("Manual position must not be adopted");
});
Deno.test("3H Wick trailing decision tightens a BUY stop at activation", () => {
  const result = decideThreeHourWickPositionAction(base, base.executedAtEpoch + 60);
  if (result.action !== "MODIFY_STOP" || result.stopLoss !== 100) throw new Error(`Unexpected decision: ${JSON.stringify(result)}`);
});
Deno.test("3H Wick never loosens a BUY stop", () => {
  const result = decideThreeHourWickPositionAction({ ...base, currentPrice: 100.2, stopLoss: 99.5 }, base.executedAtEpoch + 60);
  if (result.action !== "HOLD" || result.reason !== "STOP_NOT_TIGHTER") throw new Error(`Unexpected decision: ${JSON.stringify(result)}`);
});
Deno.test("3H Wick applies the mirrored trailing rule to SELL positions", () => {
  const result = decideThreeHourWickPositionAction({ ...base, direction: "SELL", currentPrice: 99.3, stopLoss: 102 }, base.executedAtEpoch + 60);
  if (result.action !== "MODIFY_STOP" || result.stopLoss !== 100) throw new Error(`Unexpected decision: ${JSON.stringify(result)}`);
});
Deno.test("3H Wick closes only its own position after three hours", () => {
  const due = decideThreeHourWickPositionAction(base, base.executedAtEpoch + 3 * 60 * 60);
  if (due.action !== "CLOSE" || due.reason !== "MAX_HOLD_TIME") throw new Error("Expected max-hold close");
  const manual = decideThreeHourWickPositionAction({ ...base, label: "manual-trade" }, base.executedAtEpoch + 4 * 60 * 60);
  if (manual.action !== "IGNORE") throw new Error("Manual position must never be closed");
});
Deno.test("3H Wick ignores closed and malformed broker positions", () => {
  const closed = decideThreeHourWickPositionAction({ ...base, status: "closed" }, base.executedAtEpoch + 60);
  if (closed.action !== "IGNORE" || closed.reason !== "NOT_OPEN") throw new Error("Closed position must be ignored");
  const malformed = decideThreeHourWickPositionAction({ ...base, currentPrice: Number.NaN }, base.executedAtEpoch + 60);
  if (malformed.action !== "IGNORE" || malformed.reason !== "INVALID_POSITION") throw new Error("Invalid quote must fail closed");
});
Deno.test("3H Wick label builder rejects malformed intent identifiers", () => {
  let rejected = false;
  try { buildThreeHourWickPositionLabel("not-a-uuid"); } catch { rejected = true; }
  if (!rejected) throw new Error("Expected invalid intent ID to be rejected");
});
