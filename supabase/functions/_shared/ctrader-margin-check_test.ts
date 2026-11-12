import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateCTraderExpectedMargin } from "./ctrader-margin-check.ts";

const base = {
  expectedMarginRaw: 20_000,
  freeMarginRaw: 100_000,
  balanceRaw: 200_000,
  moneyDigits: 2,
  maxMarginUtilizationPercent: 20,
  safetyBufferPercent: 25,
};

Deno.test("accepts broker expected margin with adequate free-margin buffer", () => {
  const result = validateCTraderExpectedMargin(base);
  assertEquals(result.expectedMargin, 200);
  assertEquals(result.freeMargin, 1000);
  assertEquals(result.balance, 2000);
  assertEquals(result.marginUtilizationPercent, 10);
  assertEquals(result.requiredFreeMargin, 250);
});

Deno.test("rejects expected margin above configured account utilization", () => {
  assertThrows(() => validateCTraderExpectedMargin({
    ...base,
    expectedMarginRaw: 50_000,
  }), Error, "expected_margin_exceeds_configured_utilization");
});

Deno.test("rejects insufficient free margin after buffer", () => {
  assertThrows(() => validateCTraderExpectedMargin({
    ...base,
    freeMarginRaw: 24_999,
  }), Error, "insufficient_free_margin_after_safety_buffer");
});

Deno.test("rejects invalid broker money scale and values", () => {
  assertThrows(() => validateCTraderExpectedMargin({ ...base, moneyDigits: 9 }), Error, "invalid_money_digits");
  assertThrows(() => validateCTraderExpectedMargin({ ...base, expectedMarginRaw: 0 }), Error, "invalid_broker_margin_values");
});
