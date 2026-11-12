export type CTraderExecutionPreflightInput = {
  accessRights: number;
  tradingMode: number;
  direction: "BUY" | "SELL";
  shortSellingEnabled: boolean;
  isLimitedRisk: boolean;
  symbolAllowsGuaranteedStopLoss: boolean;
  guaranteedStopLossRequested: boolean;
  bid: number;
  ask: number;
  pipSize: number;
  maxSpreadPips: number;
  volumeCents: number;
  minVolume: number;
  maxVolume: number;
  stepVolume: number;
};

export type CTraderExecutionPreflightResult = {
  allowed: true;
  spreadPips: number;
  guaranteedStopLoss: boolean;
};

const positive = (n: number) => Number.isFinite(n) && n > 0;

/** Fail-closed broker/account checks. This function never sends an order. */
export function validateCTraderExecutionPreflight(
  input: CTraderExecutionPreflightInput,
): CTraderExecutionPreflightResult {
  // ProtoOAAccessRights: FULL_ACCESS=0, CLOSE_ONLY=1, NO_TRADING=2, NO_LOGIN=3.
  if (input.accessRights !== 0) throw new Error("ctrader_account_not_full_trading_access");
  // ProtoOATradingMode: ENABLED=0; every other mode blocks new orders.
  if (input.tradingMode !== 0) throw new Error("ctrader_symbol_not_enabled_for_new_trades");
  if (input.direction === "SELL" && !input.shortSellingEnabled) {
    throw new Error("ctrader_short_selling_not_allowed");
  }
  if (input.isLimitedRisk &&
      (!input.symbolAllowsGuaranteedStopLoss || !input.guaranteedStopLossRequested)) {
    throw new Error("ctrader_limited_risk_requires_guaranteed_stop_loss");
  }
  if (!positive(input.bid) || !positive(input.ask) || input.ask < input.bid ||
      !positive(input.pipSize)) {
    throw new Error("ctrader_live_quote_invalid");
  }
  const spreadPips = Math.round(((input.ask - input.bid) / input.pipSize) * 1e8) / 1e8;
  if (!Number.isFinite(input.maxSpreadPips) || input.maxSpreadPips < 0) {
    throw new Error("ctrader_spread_limit_invalid");
  }
  if (input.maxSpreadPips > 0 && spreadPips > input.maxSpreadPips) {
    throw new Error("ctrader_spread_limit_exceeded");
  }
  if (!Number.isInteger(input.volumeCents) || !Number.isInteger(input.minVolume) ||
      !Number.isInteger(input.maxVolume) || !Number.isInteger(input.stepVolume) ||
      input.minVolume <= 0 || input.maxVolume < input.minVolume ||
      input.stepVolume <= 0 || input.volumeCents < input.minVolume ||
      input.volumeCents > input.maxVolume ||
      (input.volumeCents - input.minVolume) % input.stepVolume !== 0) {
    throw new Error("ctrader_volume_outside_broker_rules");
  }
  return {
    allowed: true,
    spreadPips,
    guaranteedStopLoss: input.isLimitedRisk,
  };
}
