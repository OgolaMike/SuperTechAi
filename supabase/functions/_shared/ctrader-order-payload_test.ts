import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCTraderProtectedPendingOrder } from "./ctrader-order-payload.ts";

const base = {
  accountId: "123456",
  symbolId: "42",
  intentId: "a1234567-b123-c123-d123-e123456789ab",
  clientOrderId: "st_a1234567b123c123d123",
  orderKind: "LIMIT" as const,
  direction: "BUY" as const,
  volumeCents: 1000,
  entryPrice: 1.1,
  stopLoss: 1.095,
  takeProfit: 1.11,
  symbolTradingMode: 0,
  shortSellingEnabled: true,
  isLimitedRiskAccount: false,
  symbolAllowsGuaranteedStopLoss: false,
};

Deno.test("builds a protected BUY LIMIT request using cTrader enum and volume units", () => {
  const payload = buildCTraderProtectedPendingOrder(base);
  assertEquals(payload.orderType, 2);
  assertEquals(payload.tradeSide, 1);
  assertEquals(payload.volume, 1000);
  assertEquals(payload.limitPrice, 1.1);
  assertEquals(payload.stopLoss, 1.095);
  assertEquals(payload.takeProfit, 1.11);
  assertEquals(payload.label, `supertech:${base.intentId}`);
});

Deno.test("builds a protected SELL STOP request", () => {
  const payload = buildCTraderProtectedPendingOrder({
    ...base,
    orderKind: "STOP",
    direction: "SELL",
    entryPrice: 1.1,
    stopLoss: 1.105,
    takeProfit: 1.09,
  });
  assertEquals(payload.orderType, 3);
  assertEquals(payload.tradeSide, 2);
  assertEquals(payload.stopPrice, 1.1);
});

Deno.test("never builds an unprotected MARKET order", () => {
  assertThrows(
    () => buildCTraderProtectedPendingOrder({ ...base, orderKind: "MARKET" }),
    Error,
    "market_orders_require_separately_verified_protection",
  );
});

Deno.test("rejects invalid protection geometry and disabled symbols", () => {
  assertThrows(
    () => buildCTraderProtectedPendingOrder({ ...base, takeProfit: 1.09 }),
    Error,
    "invalid_buy_protection_geometry",
  );
  assertThrows(
    () => buildCTraderProtectedPendingOrder({ ...base, symbolTradingMode: 3 }),
    Error,
    "symbol_not_open_for_new_orders",
  );
});

Deno.test("rejects sells when the broker disables short selling", () => {
  assertThrows(
    () => buildCTraderProtectedPendingOrder({
      ...base,
      direction: "SELL",
      stopLoss: 1.105,
      takeProfit: 1.09,
      shortSellingEnabled: false,
    }),
    Error,
    "short_selling_not_allowed",
  );
});
