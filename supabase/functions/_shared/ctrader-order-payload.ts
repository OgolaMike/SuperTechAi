export type CTraderPendingOrderInput = {
  accountId: string;
  symbolId: string;
  intentId: string;
  clientOrderId: string;
  orderKind: "LIMIT" | "STOP" | "MARKET";
  direction: "BUY" | "SELL";
  volumeCents: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  symbolTradingMode: number;
  shortSellingEnabled: boolean;
  isLimitedRiskAccount: boolean;
  symbolAllowsGuaranteedStopLoss: boolean;
};

export type CTraderNewOrderPayload = {
  ctidTraderAccountId: number;
  symbolId: number;
  orderType: number;
  tradeSide: number;
  volume: number;
  limitPrice?: number;
  stopPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  relativeStopLoss?: number;
  relativeTakeProfit?: number;
  guaranteedStopLoss?: boolean;
  clientOrderId: string;
  label: string;
};

/**
 * Builds only protected pending-order requests. Market orders are deliberately
 * rejected until a separately tested immediate-protection/flatten workflow is
 * available. This helper does not send anything to cTrader.
 */
export function buildCTraderProtectedPendingOrder(
  input: CTraderPendingOrderInput,
): CTraderNewOrderPayload {
  const accountId = Number(input.accountId);
  const symbolId = Number(input.symbolId);
  if (!Number.isSafeInteger(accountId) || accountId <= 0 ||
      !Number.isSafeInteger(symbolId) || symbolId <= 0) {
    throw new Error("invalid_ctrader_account_or_symbol");
  }
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(input.clientOrderId)) {
    throw new Error("invalid_client_order_id");
  }
  if (!/^[0-9a-f-]{36}$/i.test(input.intentId)) {
    throw new Error("invalid_intent_id");
  }
  if (!Number.isSafeInteger(input.volumeCents) || input.volumeCents <= 0) {
    throw new Error("invalid_volume_cents");
  }
  if (input.orderKind === "MARKET") {
    throw new Error("market_orders_require_separately_verified_protection");
  }
  if (input.orderKind !== "LIMIT" && input.orderKind !== "STOP") {
    throw new Error("unsupported_order_kind");
  }
  if (input.symbolTradingMode !== 0) throw new Error("symbol_not_open_for_new_orders");
  if (input.direction === "SELL" && !input.shortSellingEnabled) {
    throw new Error("short_selling_not_allowed");
  }
  if (![input.entryPrice, input.stopLoss, input.takeProfit].every((v) => Number.isFinite(v) && v > 0)) {
    throw new Error("invalid_order_prices");
  }
  if (input.direction === "BUY" &&
      !(input.stopLoss < input.entryPrice && input.takeProfit > input.entryPrice)) {
    throw new Error("invalid_buy_protection_geometry");
  }
  if (input.direction === "SELL" &&
      !(input.takeProfit < input.entryPrice && input.stopLoss > input.entryPrice)) {
    throw new Error("invalid_sell_protection_geometry");
  }
  if (input.isLimitedRiskAccount && !input.symbolAllowsGuaranteedStopLoss) {
    throw new Error("limited_risk_account_requires_gsl_supported_symbol");
  }

  const payload: CTraderNewOrderPayload = {
    ctidTraderAccountId: accountId,
    symbolId,
    orderType: input.orderKind === "LIMIT" ? 2 : 3,
    tradeSide: input.direction === "BUY" ? 1 : 2,
    volume: input.volumeCents,
    clientOrderId: input.clientOrderId,
    label: `supertech:${input.intentId}`,
  };
  if (input.isLimitedRiskAccount) {
    const relativeStopLoss = Math.round(Math.abs(input.entryPrice - input.stopLoss) * 100000);
    const relativeTakeProfit = Math.round(Math.abs(input.takeProfit - input.entryPrice) * 100000);
    if (!Number.isSafeInteger(relativeStopLoss) || !Number.isSafeInteger(relativeTakeProfit) ||
        relativeStopLoss <= 0 || relativeTakeProfit <= 0) {
      throw new Error("invalid_relative_protection_distance");
    }
    payload.relativeStopLoss = relativeStopLoss;
    payload.relativeTakeProfit = relativeTakeProfit;
    payload.guaranteedStopLoss = true;
  } else {
    payload.stopLoss = input.stopLoss;
    payload.takeProfit = input.takeProfit;
  }
  if (input.orderKind === "LIMIT") payload.limitPrice = input.entryPrice;
  else payload.stopPrice = input.entryPrice;
  return payload;
}
