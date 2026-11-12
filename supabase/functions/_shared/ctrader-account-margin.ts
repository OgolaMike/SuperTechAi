export type CTraderOpenPositionMargin = {
  positionId: string | number;
  positionStatus: number;
  usedMargin: number;
  moneyDigits: number;
};

export type CTraderPositionPnl = {
  positionId: string | number;
  netUnrealizedPnL: number;
};

export type CTraderAccountMarginInput = {
  balanceRaw: number;
  balanceMoneyDigits: number;
  pnlRawRows: CTraderPositionPnl[];
  pnlMoneyDigits: number;
  positions: CTraderOpenPositionMargin[];
  expectedMargin: number;
  maxMarginUtilizationPercent: number;
  safetyBufferPercent: number;
};

export type CTraderAccountMarginResult = {
  balance: number;
  unrealizedNetPnl: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
  expectedMargin: number;
  marginUtilizationPercent: number;
  requiredFreeMargin: number;
  openPositionsCount: number;
};

/** Reconstructs current free margin from broker-reported balance, PnL and each position's used margin. */
export function calculateCTraderAccountMargin(input: CTraderAccountMarginInput): CTraderAccountMarginResult {
  const validDigits = (value: number) => Number.isInteger(value) && value >= 0 && value <= 8;
  if (!validDigits(input.balanceMoneyDigits) || !validDigits(input.pnlMoneyDigits)) {
    throw new Error("invalid_account_money_scale");
  }
  if (!Number.isFinite(input.balanceRaw) || input.balanceRaw <= 0 ||
      !Number.isFinite(input.expectedMargin) || input.expectedMargin <= 0) {
    throw new Error("invalid_account_margin_values");
  }
  if (!Number.isFinite(input.maxMarginUtilizationPercent) ||
      input.maxMarginUtilizationPercent <= 0 || input.maxMarginUtilizationPercent > 100) {
    throw new Error("invalid_max_margin_utilization");
  }
  if (!Number.isFinite(input.safetyBufferPercent) ||
      input.safetyBufferPercent < 0 || input.safetyBufferPercent > 500) {
    throw new Error("invalid_margin_safety_buffer");
  }

  const positionIds = new Set<string>();
  let usedMargin = 0;
  for (const position of input.positions) {
    const id = String(position.positionId);
    if (!id || id === "undefined" || positionIds.has(id)) throw new Error("invalid_or_duplicate_open_position");
    positionIds.add(id);
    if (position.positionStatus !== 1) throw new Error("non_open_position_in_margin_snapshot");
    if (!validDigits(position.moneyDigits) || !Number.isFinite(position.usedMargin) || position.usedMargin < 0) {
      throw new Error("open_position_margin_unavailable");
    }
    usedMargin += position.usedMargin / (10 ** position.moneyDigits);
  }

  const pnlIds = new Set<string>();
  let unrealizedNetPnl = 0;
  for (const pnl of input.pnlRawRows) {
    const id = String(pnl.positionId);
    if (!id || id === "undefined" || pnlIds.has(id) || !positionIds.has(id) ||
        !Number.isFinite(pnl.netUnrealizedPnL)) {
      throw new Error("position_pnl_snapshot_mismatch");
    }
    pnlIds.add(id);
    unrealizedNetPnl += pnl.netUnrealizedPnL / (10 ** input.pnlMoneyDigits);
  }
  if (pnlIds.size !== positionIds.size) throw new Error("position_pnl_snapshot_incomplete");

  const balance = input.balanceRaw / (10 ** input.balanceMoneyDigits);
  const equity = balance + unrealizedNetPnl;
  const freeMargin = equity - usedMargin;
  if (!Number.isFinite(equity) || equity <= 0 || !Number.isFinite(freeMargin) || freeMargin < 0) {
    throw new Error("invalid_or_negative_free_margin");
  }
  const marginUtilizationPercent = input.expectedMargin / equity * 100;
  const requiredFreeMargin = input.expectedMargin * (1 + input.safetyBufferPercent / 100);
  if (marginUtilizationPercent > input.maxMarginUtilizationPercent) {
    throw new Error("expected_margin_exceeds_configured_utilization");
  }
  if (freeMargin + 1e-8 < requiredFreeMargin) {
    throw new Error("insufficient_free_margin_after_safety_buffer");
  }
  return {
    balance, unrealizedNetPnl, equity, usedMargin, freeMargin,
    expectedMargin: input.expectedMargin, marginUtilizationPercent,
    requiredFreeMargin, openPositionsCount: positionIds.size,
  };
}
