import {
  calculateThreeHourWickTrailingStop,
  isThreeHourWickPositionDue,
  type WickDirection,
} from "./threeHourWick.ts";

export const THREE_HOUR_WICK_POSITION_LABEL_PREFIX = "supertech:3h-wick:v1:";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ThreeHourWickBrokerPosition = {
  brokerPositionId: string;
  label: string | null;
  direction: WickDirection;
  status: "open" | "closed" | "unknown";
  entryPrice: number;
  currentPrice: number;
  stopLoss: number | null;
  executedAtEpoch: number;
};

export type ThreeHourWickManagementDecision =
  | { action: "IGNORE"; reason: "NOT_STRATEGY_OWNED" | "NOT_OPEN" | "INVALID_POSITION" }
  | { action: "HOLD"; reason: "HOLDING" | "STOP_NOT_TIGHTER" | "STOP_WOULD_TRIGGER" }
  | { action: "MODIFY_STOP"; brokerPositionId: string; stopLoss: number }
  | { action: "CLOSE"; brokerPositionId: string; reason: "MAX_HOLD_TIME" };

/** Generate a compact broker label that identifies only this strategy and intent. */
export function buildThreeHourWickPositionLabel(intentId: string): string {
  if (!UUID.test(intentId)) throw new Error("invalid_three_hour_wick_intent_id");
  return `${THREE_HOUR_WICK_POSITION_LABEL_PREFIX}${intentId}`;
}

/** Exact ownership check. Generic SuperTech labels and manual positions are not owned. */
export function isThreeHourWickOwnedLabel(label: string | null): boolean {
  return typeof label === "string" &&
    label.startsWith(THREE_HOUR_WICK_POSITION_LABEL_PREFIX) &&
    UUID.test(label.slice(THREE_HOUR_WICK_POSITION_LABEL_PREFIX.length));
}

/**
 * Pure decision function for a broker adapter.
 * It never calls cTrader and never authorizes touching a position without the
 * exact strategy label. The adapter must verify broker acknowledgement before
 * recording a successful stop modification or close.
 */
export function decideThreeHourWickPositionAction(
  position: ThreeHourWickBrokerPosition,
  nowEpoch: number,
): ThreeHourWickManagementDecision {
  if (!isThreeHourWickOwnedLabel(position.label)) {
    return { action: "IGNORE", reason: "NOT_STRATEGY_OWNED" };
  }
  if (position.status !== "open") return { action: "IGNORE", reason: "NOT_OPEN" };
  if (!position.brokerPositionId ||
      ![position.entryPrice, position.currentPrice, position.executedAtEpoch, nowEpoch]
        .every((value) => Number.isFinite(value) && value > 0) ||
      (position.stopLoss !== null && (!Number.isFinite(position.stopLoss) || position.stopLoss <= 0))) {
    return { action: "IGNORE", reason: "INVALID_POSITION" };
  }

  if (isThreeHourWickPositionDue(position.executedAtEpoch, nowEpoch)) {
    return { action: "CLOSE", brokerPositionId: position.brokerPositionId, reason: "MAX_HOLD_TIME" };
  }
  if (position.stopLoss === null) return { action: "IGNORE", reason: "INVALID_POSITION" };

  const proposed = calculateThreeHourWickTrailingStop(
    position.direction,
    position.entryPrice,
    position.currentPrice,
    position.stopLoss,
  );
  const tighter = position.direction === "BUY"
    ? proposed > position.stopLoss
    : proposed < position.stopLoss;
  if (!tighter) return { action: "HOLD", reason: "STOP_NOT_TIGHTER" };

  // Never request a stop that is already at or through the current executable price.
  if (position.direction === "BUY" ? proposed >= position.currentPrice : proposed <= position.currentPrice) {
    return { action: "HOLD", reason: "STOP_WOULD_TRIGGER" };
  }
  return {
    action: "MODIFY_STOP",
    brokerPositionId: position.brokerPositionId,
    stopLoss: proposed,
  };
}
