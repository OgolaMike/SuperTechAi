import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { calculateCTraderAccountMargin } from "./ctrader-account-margin.ts";

Deno.test("calculates equity and free margin using broker scales per position", () => {
  const result = calculateCTraderAccountMargin({
    balanceRaw: 100000, balanceMoneyDigits: 2,
    pnlRawRows: [
      { positionId: 11, netUnrealizedPnL: 1250 },
      { positionId: 12, netUnrealizedPnL: -250 },
    ],
    pnlMoneyDigits: 2,
    positions: [
      { positionId: 11, positionStatus: 1, usedMargin: 20000, moneyDigits: 2 },
      { positionId: 12, positionStatus: 1, usedMargin: 10000, moneyDigits: 2 },
    ],
    expectedMargin: 10, maxMarginUtilizationPercent: 50, safetyBufferPercent: 25,
  });
  assertEquals(result.balance, 1000);
  assertEquals(result.unrealizedNetPnl, 10);
  assertEquals(result.equity, 1010);
  assertEquals(result.usedMargin, 300);
  assertEquals(result.freeMargin, 710);
  assertEquals(result.openPositionsCount, 2);
});

Deno.test("supports no open positions only with an empty PnL snapshot", () => {
  const result = calculateCTraderAccountMargin({
    balanceRaw: 50000, balanceMoneyDigits: 2, pnlRawRows: [], pnlMoneyDigits: 2,
    positions: [], expectedMargin: 10, maxMarginUtilizationPercent: 50, safetyBufferPercent: 25,
  });
  assertEquals(result.freeMargin, 500);
});

Deno.test("fails closed when an open position has no used-margin precision", () => {
  assertThrows(() => calculateCTraderAccountMargin({
    balanceRaw: 10000, balanceMoneyDigits: 2, pnlRawRows: [{ positionId: 1, netUnrealizedPnL: 0 }],
    pnlMoneyDigits: 2,
    positions: [{ positionId: 1, positionStatus: 1, usedMargin: 1000, moneyDigits: NaN }],
    expectedMargin: 1, maxMarginUtilizationPercent: 50, safetyBufferPercent: 25,
  }), Error, "open_position_margin_unavailable");
});

Deno.test("fails closed when broker PnL does not cover every open position", () => {
  assertThrows(() => calculateCTraderAccountMargin({
    balanceRaw: 10000, balanceMoneyDigits: 2, pnlRawRows: [], pnlMoneyDigits: 2,
    positions: [{ positionId: 1, positionStatus: 1, usedMargin: 1000, moneyDigits: 2 }],
    expectedMargin: 1, maxMarginUtilizationPercent: 50, safetyBufferPercent: 25,
  }), Error, "position_pnl_snapshot_incomplete");
});

Deno.test("rejects insufficient free margin after the safety buffer", () => {
  assertThrows(() => calculateCTraderAccountMargin({
    balanceRaw: 10000, balanceMoneyDigits: 2, pnlRawRows: [{ positionId: 1, netUnrealizedPnL: 0 }], pnlMoneyDigits: 2,
    positions: [{ positionId: 1, positionStatus: 1, usedMargin: 9500, moneyDigits: 2 }],
    expectedMargin: 10, maxMarginUtilizationPercent: 50, safetyBufferPercent: 25,
  }), Error, "insufficient_free_margin_after_safety_buffer");
});
