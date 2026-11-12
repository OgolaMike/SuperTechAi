import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { calculateCTraderRiskSize } from "./ctrader-risk-sizing.ts";

const base = {
  balance: 100_000_000,
  moneyDigits: 2,
  riskPercent: 0.5,
  entryPrice: 1.1,
  stopLoss: 1.095,
  direction: "BUY" as const,
  quoteCurrency: "USD",
  depositCurrency: "USD",
  minVolume: 100,
  maxVolume: 100_000_000,
  stepVolume: 100,
};

Deno.test("sizes a linear USD-quoted position within the configured risk", () => {
  const result = calculateCTraderRiskSize(base);
  assertEquals(result.balance, 1_000_000);
  assertEquals(result.riskAmount, 5_000);
  assertEquals(result.volumeUnits, 1_000_000);
  assertEquals(result.estimatedStopLoss, 5_000);
});

Deno.test("rejects non-matching deposit currencies without a conversion rate", () => {
  assertThrows(
    () => calculateCTraderRiskSize({ ...base, depositCurrency: "KES" }),
    Error,
    "quote_to_deposit_conversion_unavailable",
  );
});

Deno.test("rejects incorrect BUY stop geometry", () => {
  assertThrows(
    () => calculateCTraderRiskSize({ ...base, stopLoss: 1.11 }),
    Error,
    "buy_stop_loss_must_be_below_entry",
  );
});

Deno.test("rejects incorrect SELL stop geometry", () => {
  assertThrows(
    () => calculateCTraderRiskSize({ ...base, direction: "SELL", stopLoss: 1.09 }),
    Error,
    "sell_stop_loss_must_be_above_entry",
  );
});

Deno.test("rounds volume down to the broker's step and never exceeds risk", () => {
  const result = calculateCTraderRiskSize({
    ...base,
    balance: 1_000_000,
    moneyDigits: 2,
    riskPercent: 0.5,
    minVolume: 100,
    maxVolume: 1_000_000,
    stepVolume: 250,
  });
  assertEquals(result.volumeCents % 250, 100 % 250);
  if (result.estimatedStopLoss > result.riskAmount) throw new Error("risk budget exceeded");
});

Deno.test("rejects a size below the broker minimum when the minimum would exceed risk", () => {
  assertThrows(
    () => calculateCTraderRiskSize({
      ...base,
      balance: 100,
      moneyDigits: 2,
      riskPercent: 0.1,
      minVolume: 100_000,
      maxVolume: 1_000_000,
      stepVolume: 100,
    }),
    Error,
    "risk_size_outside_symbol_volume_limits",
  );
});
