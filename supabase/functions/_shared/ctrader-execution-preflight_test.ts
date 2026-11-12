import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateCTraderExecutionPreflight } from "./ctrader-execution-preflight.ts";

const base = {
  accessRights: 0,
  tradingMode: 0,
  direction: "BUY" as const,
  shortSellingEnabled: true,
  isLimitedRisk: false,
  symbolAllowsGuaranteedStopLoss: false,
  guaranteedStopLossRequested: false,
  bid: 1.1000,
  ask: 1.1002,
  pipSize: 0.0001,
  maxSpreadPips: 3,
  volumeCents: 10_000,
  minVolume: 100,
  maxVolume: 100_000,
  stepVolume: 100,
};

Deno.test("allows an enabled account and symbol inside spread and volume rules", () => {
  const result = validateCTraderExecutionPreflight(base);
  assertEquals(result.allowed, true);
  assertEquals(result.spreadPips, 2);
  assertEquals(result.guaranteedStopLoss, false);
});

Deno.test("blocks accounts without full trading access", () => {
  assertThrows(() => validateCTraderExecutionPreflight({ ...base, accessRights: 1 }), Error, "ctrader_account_not_full_trading_access");
  assertThrows(() => validateCTraderExecutionPreflight({ ...base, accessRights: 2 }), Error, "ctrader_account_not_full_trading_access");
});

Deno.test("blocks symbols not enabled for new orders", () => {
  for (const tradingMode of [1, 2, 3]) {
    assertThrows(() => validateCTraderExecutionPreflight({ ...base, tradingMode }), Error, "ctrader_symbol_not_enabled_for_new_trades");
  }
});

Deno.test("blocks SELL when broker disables short selling", () => {
  assertThrows(() => validateCTraderExecutionPreflight({ ...base, direction: "SELL", shortSellingEnabled: false }), Error, "ctrader_short_selling_not_allowed");
});

Deno.test("limited-risk accounts require symbol and order guaranteed stop loss", () => {
  assertThrows(() => validateCTraderExecutionPreflight({ ...base, isLimitedRisk: true }), Error, "ctrader_limited_risk_requires_guaranteed_stop_loss");
  const result = validateCTraderExecutionPreflight({
    ...base,
    isLimitedRisk: true,
    symbolAllowsGuaranteedStopLoss: true,
    guaranteedStopLossRequested: true,
  });
  assertEquals(result.guaranteedStopLoss, true);
});

Deno.test("blocks spread above the member's configured ceiling", () => {
  assertThrows(() => validateCTraderExecutionPreflight({ ...base, maxSpreadPips: 1 }), Error, "ctrader_spread_limit_exceeded");
});

Deno.test("blocks volume that is not aligned to broker minimum and step", () => {
  assertThrows(() => validateCTraderExecutionPreflight({ ...base, volumeCents: 10_050 }), Error, "ctrader_volume_outside_broker_rules");
});
