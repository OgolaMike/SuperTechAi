export type CTraderMarginCheckInput = {
  expectedMarginRaw: number;
  freeMarginRaw: number;
  balanceRaw: number;
  moneyDigits: number;
  maxMarginUtilizationPercent: number;
  safetyBufferPercent: number;
};

export type CTraderMarginCheckResult = {
  expectedMargin: number;
  freeMargin: number;
  balance: number;
  marginUtilizationPercent: number;
  requiredFreeMargin: number;
};

/** Validates a broker-reported expected margin response; it never requests or places an order. */
export function validateCTraderExpectedMargin(
  input: CTraderMarginCheckInput,
): CTraderMarginCheckResult {
  if (!Number.isInteger(input.moneyDigits) || input.moneyDigits < 0 || input.moneyDigits > 8) {
    throw new Error("invalid_money_digits");
  }
  const scale = 10 ** input.moneyDigits;
  const expectedMargin = input.expectedMarginRaw / scale;
  const freeMargin = input.freeMarginRaw / scale;
  const balance = input.balanceRaw / scale;
  if (!Number.isFinite(expectedMargin) || expectedMargin <= 0 ||
      !Number.isFinite(freeMargin) || freeMargin < 0 ||
      !Number.isFinite(balance) || balance <= 0) {
    throw new Error("invalid_broker_margin_values");
  }
  if (!Number.isFinite(input.maxMarginUtilizationPercent) ||
      input.maxMarginUtilizationPercent <= 0 || input.maxMarginUtilizationPercent > 100) {
    throw new Error("invalid_max_margin_utilization");
  }
  if (!Number.isFinite(input.safetyBufferPercent) ||
      input.safetyBufferPercent < 0 || input.safetyBufferPercent > 500) {
    throw new Error("invalid_margin_safety_buffer");
  }
  const marginUtilizationPercent = expectedMargin / balance * 100;
  const requiredFreeMargin = expectedMargin * (1 + input.safetyBufferPercent / 100);
  if (marginUtilizationPercent > input.maxMarginUtilizationPercent) {
    throw new Error("expected_margin_exceeds_configured_utilization");
  }
  if (freeMargin + 1e-8 < requiredFreeMargin) {
    throw new Error("insufficient_free_margin_after_safety_buffer");
  }
  return {
    expectedMargin,
    freeMargin,
    balance,
    marginUtilizationPercent,
    requiredFreeMargin,
  };
}
