/**
 * Shared execution intent contract for the SuperTech AI cloud automation layer.
 *
 * This module is deliberately provider-neutral at the orchestration boundary.
 * Provider adapters remain responsible for exchange-specific sizing, signing,
 * order types, protection and reconciliation.
 */

export const EXECUTION_PROVIDERS = [
  "binance_spot",
  "binance_futures",
  "okx_futures",
  "ctrader",
  "mt5",
  "deriv",
] as const;

export type ExecutionProvider = (typeof EXECUTION_PROVIDERS)[number];
export type TradingEnvironment = "demo" | "live";
export type OrderSide = "buy" | "sell";
export type OrderKind = "market" | "limit" | "stop" | "stop_limit";

export const EXECUTION_STATES = [
  "created",
  "validated",
  "claimed",
  "submitting",
  "accepted",
  "partially_filled",
  "filled",
  "protected",
  "reconciled",
  "rejected",
  "expired",
  "cancelled",
  "uncertain",
] as const;

export type ExecutionState = (typeof EXECUTION_STATES)[number];

export type ExecutionIntent = {
  schemaVersion: 1;
  intentId: string;
  idempotencyKey: string;
  userId: string;
  provider: ExecutionProvider;
  connectionId: string;
  providerAccountId: string;
  environment: TradingEnvironment;
  strategyId: string;
  strategyVersion: string;
  signalId: string;
  signalCreatedAt: string;
  expiresAt: string;
  order: {
    instrument: string;
    side: OrderSide;
    kind: OrderKind;
    entryPrice: number;
    quantity?: number;
    quoteAmount?: number;
    limitPrice?: number;
    stopPrice?: number;
    stopLoss: number;
    takeProfit: number;
    reduceOnly?: boolean;
  };
  risk: {
    maxLossAmount: number;
    maxLossCurrency: string;
    riskPercent: number;
    maxOpenPositions: number;
    dailyLossLimitPercent: number;
    leverage?: number;
  };
  authorization: {
    liveExecutionAuthorized: boolean;
    emergencyStop: boolean;
    tradingPermissionVerifiedAt: string;
  };
  createdAt: string;
};

export type ExecutionTransition = {
  from: ExecutionState;
  to: ExecutionState;
  evidence?: {
    brokerOrderId?: string;
    brokerClientOrderId?: string;
    filledQuantity?: number;
    averageFillPrice?: number;
    protectionConfirmed?: boolean;
    brokerLookupCompleted?: boolean;
  };
};

const TRANSITIONS: Record<ExecutionState, readonly ExecutionState[]> = {
  created: ["validated", "rejected", "expired"],
  validated: ["claimed", "rejected", "expired"],
  claimed: ["submitting", "rejected", "expired"],
  submitting: ["accepted", "partially_filled", "filled", "rejected", "uncertain"],
  accepted: ["partially_filled", "filled", "protected", "rejected", "cancelled", "uncertain"],
  partially_filled: ["filled", "protected", "cancelled", "uncertain"],
  filled: ["protected", "uncertain"],
  protected: ["reconciled", "uncertain"],
  reconciled: [],
  rejected: [],
  expired: [],
  cancelled: [],
  // An uncertain submission may only advance after a broker-side lookup.
  uncertain: ["accepted", "partially_filled", "filled", "protected", "reconciled", "rejected"],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const positive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
const validDate = (value: string) => Number.isFinite(Date.parse(value));

export function canTransitionExecutionState(
  transition: ExecutionTransition,
): boolean {
  if (!TRANSITIONS[transition.from]?.includes(transition.to)) return false;
  if (transition.from === "uncertain" && transition.evidence?.brokerLookupCompleted !== true) {
    return false;
  }
  if (transition.to === "protected" && transition.evidence?.protectionConfirmed !== true) {
    return false;
  }
  if (transition.to === "reconciled" && transition.evidence?.brokerLookupCompleted !== true) {
    return false;
  }
  return true;
}

export function assertExecutionIntent(value: ExecutionIntent): void {
  if (value.schemaVersion !== 1) throw new Error("unsupported_execution_intent_version");
  if (!UUID.test(value.intentId)) throw new Error("invalid_execution_intent_id");
  if (!value.idempotencyKey || value.idempotencyKey.length > 180) {
    throw new Error("invalid_execution_idempotency_key");
  }
  if (!value.userId || !value.connectionId || !value.providerAccountId) {
    throw new Error("execution_account_context_missing");
  }
  if (!EXECUTION_PROVIDERS.includes(value.provider)) throw new Error("unsupported_execution_provider");
  if (value.environment !== "demo" && value.environment !== "live") {
    throw new Error("unsupported_trading_environment");
  }
  if (value.order.side !== "buy" && value.order.side !== "sell") {
    throw new Error("unsupported_execution_side");
  }
  if (!["market", "limit", "stop", "stop_limit"].includes(value.order.kind)) {
    throw new Error("unsupported_execution_order_kind");
  }
  if (typeof value.authorization.liveExecutionAuthorized !== "boolean" ||
      typeof value.authorization.emergencyStop !== "boolean") {
    throw new Error("execution_authorization_flags_invalid");
  }
  if (!value.strategyId || !value.strategyVersion || !value.signalId || !value.order.instrument) {
    throw new Error("execution_strategy_or_instrument_missing");
  }
  if (!validDate(value.signalCreatedAt) || !validDate(value.expiresAt) || !validDate(value.createdAt)) {
    throw new Error("invalid_execution_intent_timestamp");
  }
  if (Date.parse(value.expiresAt) <= Date.parse(value.createdAt) ||
      Date.parse(value.signalCreatedAt) > Date.parse(value.expiresAt)) {
    throw new Error("execution_intent_timestamps_out_of_order");
  }
  if (!positive(value.order.entryPrice) || !positive(value.order.stopLoss) || !positive(value.order.takeProfit)) {
    throw new Error("invalid_execution_price_or_protection_levels");
  }
  if (value.order.side === "buy" &&
      !(value.order.stopLoss < value.order.entryPrice && value.order.entryPrice < value.order.takeProfit)) {
    throw new Error("buy_entry_or_protection_geometry_invalid");
  }
  if (value.order.side === "sell" &&
      !(value.order.takeProfit < value.order.entryPrice && value.order.entryPrice < value.order.stopLoss)) {
    throw new Error("sell_entry_or_protection_geometry_invalid");
  }
  if (value.order.kind === "limit" && !positive(value.order.limitPrice)) {
    throw new Error("limit_order_price_missing");
  }
  if (value.order.kind === "stop" && !positive(value.order.stopPrice)) {
    throw new Error("stop_order_price_missing");
  }
  if (value.order.kind === "stop_limit" &&
      (!positive(value.order.stopPrice) || !positive(value.order.limitPrice))) {
    throw new Error("stop_limit_order_prices_missing");
  }
  if (value.order.quantity !== undefined && !positive(value.order.quantity)) {
    throw new Error("invalid_execution_quantity");
  }
  if (value.order.quoteAmount !== undefined && !positive(value.order.quoteAmount)) {
    throw new Error("invalid_execution_quote_amount");
  }
  if (!positive(value.risk.maxLossAmount) || !value.risk.maxLossCurrency ||
      !positive(value.risk.riskPercent) || value.risk.riskPercent > 2 ||
      !Number.isInteger(value.risk.maxOpenPositions) || value.risk.maxOpenPositions < 1 ||
      !positive(value.risk.dailyLossLimitPercent) || value.risk.dailyLossLimitPercent > 5) {
    throw new Error("execution_risk_limits_invalid");
  }
  if (value.environment === "live" &&
      (!value.authorization.liveExecutionAuthorized || value.authorization.emergencyStop)) {
    throw new Error("live_execution_not_authorized_or_emergency_stop_active");
  }
  if (!validDate(value.authorization.tradingPermissionVerifiedAt)) {
    throw new Error("trading_permission_verification_missing");
  }
  if (value.risk.leverage !== undefined &&
      (!Number.isInteger(value.risk.leverage) || value.risk.leverage < 1 || value.risk.leverage > 20)) {
    throw new Error("execution_leverage_invalid");
  }
}

/**
 * Stable deterministic key for an intent. It is not a broker client-order ID;
 * each adapter must map it to the provider's allowed client-ID format.
 */
export function executionIdempotencyKey(
  provider: ExecutionProvider,
  connectionId: string,
  intentId: string,
): string {
  if (!UUID.test(intentId) || !EXECUTION_PROVIDERS.includes(provider) || !connectionId.trim()) {
    throw new Error("invalid_execution_idempotency_context");
  }
  return `stai:${provider}:${connectionId}:${intentId}`;
}
