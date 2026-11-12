export type CTraderRiskSizingInput = {
  balance: number;
  moneyDigits: number;
  riskPercent: number;
  entryPrice: number;
  stopLoss: number;
  direction: "BUY" | "SELL";
  quoteCurrency: string;
  depositCurrency: string;
  minVolume: number;
  maxVolume: number;
  stepVolume: number;
  maxRiskAmount?: number;
};

export type CTraderRiskSizingResult = {
  balance: number;
  riskAmount: number;
  volumeCents: number;
  volumeUnits: number;
  estimatedStopLoss: number;
  riskPercent: number;
  quoteToDepositRate: 1;
};

const finitePositive = (value: number) => Number.isFinite(value) && value > 0;

/**
 * Conservative linear-contract sizing for symbols whose quote currency equals
 * the account deposit currency. cTrader API volume is expressed in cents of
 * units: 100 means 1.00 unit. Non-matching currencies are rejected until a
 * live broker conversion rate can be independently obtained and validated.
 */
export function calculateCTraderRiskSize(
  input: CTraderRiskSizingInput,
): CTraderRiskSizingResult {
  const balanceScale = 10 ** input.moneyDigits;
  if (!finitePositive(input.balance) || !Number.isInteger(input.moneyDigits) ||
      input.moneyDigits < 0 || input.moneyDigits > 8 || !finitePositive(balanceScale)) {
    throw new Error("invalid_account_balance");
  }
  if (!Number.isFinite(input.riskPercent) || input.riskPercent <= 0 || input.riskPercent > 1) {
    throw new Error("risk_percent_out_of_range");
  }
  if (!finitePositive(input.entryPrice) || !finitePositive(input.stopLoss)) {
    throw new Error("invalid_entry_or_stop_loss");
  }
  if (input.direction === "BUY" && input.stopLoss >= input.entryPrice) {
    throw new Error("buy_stop_loss_must_be_below_entry");
  }
  if (input.direction === "SELL" && input.stopLoss <= input.entryPrice) {
    throw new Error("sell_stop_loss_must_be_above_entry");
  }
  const quote = input.quoteCurrency.trim().toUpperCase();
  const deposit = input.depositCurrency.trim().toUpperCase();
  if (!quote || !deposit || quote !== deposit) {
    throw new Error("quote_to_deposit_conversion_unavailable");
  }
  if (!finitePositive(input.minVolume) || !finitePositive(input.maxVolume) ||
      !finitePositive(input.stepVolume) || input.maxVolume < input.minVolume) {
    throw new Error("invalid_symbol_volume_rules");
  }

  const balance = input.balance / balanceScale;
  const riskAmount = Math.min(
    balance * input.riskPercent / 100,
    input.maxRiskAmount !== undefined ? input.maxRiskAmount : Number.POSITIVE_INFINITY,
  );
  const stopDistance = Math.abs(input.entryPrice - input.stopLoss);
  // P/L for a linear instrument quoted in the deposit currency:
  // price distance × base units = deposit-currency risk.
  const rawVolumeCents = (riskAmount / stopDistance) * 100;
  if (rawVolumeCents < input.minVolume) throw new Error("risk_size_outside_symbol_volume_limits");
  const stepsFromMinimum = Math.floor((rawVolumeCents - input.minVolume) / input.stepVolume);
  const volumeCents = input.minVolume + stepsFromMinimum * input.stepVolume;
  if (!finitePositive(volumeCents) || volumeCents > input.maxVolume) {
    throw new Error("risk_size_outside_symbol_volume_limits");
  }
  const volumeUnits = volumeCents / 100;
  const estimatedStopLoss = stopDistance * volumeUnits;
  if (estimatedStopLoss > riskAmount + 1e-8) {
    throw new Error("rounded_volume_exceeds_risk_budget");
  }
  return {
    balance,
    riskAmount,
    volumeCents,
    volumeUnits,
    estimatedStopLoss,
    riskPercent: input.riskPercent,
    quoteToDepositRate: 1,
  };
}
