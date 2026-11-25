export type StrategyDirection = 'BUY' | 'SELL';
export type StrategyStatus = 'SIGNAL' | 'WAIT' | 'NO_SIGNAL' | 'STALE' | 'ERROR';

export type StrategyAssessment = {
  strategyId: string;
  strategyName: string;
  symbol: string;
  direction: StrategyDirection | null;
  status: StrategyStatus;
  signalEpoch: number;
  /** Strategy-owned strength from 0 to 100; it is not a win probability. */
  strength: number;
  /** Relative evidence weight. Keep bounded to prevent one strategy dominating. */
  weight?: number;
  reason?: string;
};

export type ConfluenceResult = {
  symbol: string;
  direction: StrategyDirection | null;
  status: 'HIGH_CONFLUENCE' | 'PARTIAL_AGREEMENT' | 'CONFLICT' | 'WAIT';
  score: number;
  agreementCount: number;
  eligibleCount: number;
  opposingCount: number;
  assessments: StrategyAssessment[];
  explanation: string;
};

export const CONFLUENCE_CONFIG = {
  minimumIndependentStrategies: 2,
  minimumScore: 65,
  maximumSignalAgeSeconds: 4 * 60 * 60 * 8,
  maximumWeight: 2,
} as const;

function validAssessment(item: StrategyAssessment, nowEpoch: number): boolean {
  return item.status === 'SIGNAL' &&
    item.direction !== null &&
    Number.isFinite(item.signalEpoch) &&
    item.signalEpoch <= nowEpoch &&
    nowEpoch - item.signalEpoch <= CONFLUENCE_CONFIG.maximumSignalAgeSeconds &&
    Number.isFinite(item.strength) &&
    item.strength >= 0 && item.strength <= 100;
}

/**
 * Combines independent strategy conclusions without changing or suppressing
 * their original signals. The returned score is an evidence/confluence score,
 * never a predicted win probability.
 */
export function evaluateStrategyConfluence(
  assessments: StrategyAssessment[],
  nowEpoch: number,
): ConfluenceResult[] {
  const bySymbol = new Map<string, StrategyAssessment[]>();
  for (const item of assessments) {
    if (!item.symbol || !item.strategyId) continue;
    const rows = bySymbol.get(item.symbol) ?? [];
    // A strategy contributes at most once per asset: keep its newest valid signal.
    const existing = rows.findIndex((row) => row.strategyId === item.strategyId);
    if (existing >= 0) {
      if (item.signalEpoch > rows[existing].signalEpoch) rows[existing] = item;
    } else rows.push(item);
    bySymbol.set(item.symbol, rows);
  }

  return [...bySymbol.entries()].map(([symbol, rows]) => {
    const eligible = rows.filter((row) => validAssessment(row, nowEpoch));
    const buys = eligible.filter((row) => row.direction === 'BUY');
    const sells = eligible.filter((row) => row.direction === 'SELL');
    const buyWeight = buys.reduce((sum, row) => sum + Math.min(CONFLUENCE_CONFIG.maximumWeight, Math.max(0.1, row.weight ?? 1)), 0);
    const sellWeight = sells.reduce((sum, row) => sum + Math.min(CONFLUENCE_CONFIG.maximumWeight, Math.max(0.1, row.weight ?? 1)), 0);
    const totalWeight = buyWeight + sellWeight;
    const buyEvidence = buys.reduce((sum, row) => sum + row.strength * Math.min(CONFLUENCE_CONFIG.maximumWeight, Math.max(0.1, row.weight ?? 1)), 0);
    const sellEvidence = sells.reduce((sum, row) => sum + row.strength * Math.min(CONFLUENCE_CONFIG.maximumWeight, Math.max(0.1, row.weight ?? 1)), 0);
    const direction: StrategyDirection | null = buyEvidence === sellEvidence ? null : buyEvidence > sellEvidence ? 'BUY' : 'SELL';
    const agreeing = direction === 'BUY' ? buys : direction === 'SELL' ? sells : [];
    const opposing = direction === 'BUY' ? sells : direction === 'SELL' ? buys : [...buys, ...sells];
    const winningEvidence = direction === 'BUY' ? buyEvidence : direction === 'SELL' ? sellEvidence : 0;
    const score = totalWeight > 0 ? Math.round((winningEvidence / totalWeight) * 100) : 0;
    const distinctAgreeing = new Set(agreeing.map((row) => row.strategyId)).size;
    const hasConflict = buys.length > 0 && sells.length > 0;
    const status: ConfluenceResult['status'] =
      distinctAgreeing >= CONFLUENCE_CONFIG.minimumIndependentStrategies &&
      score >= CONFLUENCE_CONFIG.minimumScore && !hasConflict
        ? 'HIGH_CONFLUENCE'
        : hasConflict ? 'CONFLICT'
        : distinctAgreeing > 0 ? 'PARTIAL_AGREEMENT' : 'WAIT';
    const names = agreeing.map((row) => row.strategyName);
    const explanation = status === 'HIGH_CONFLUENCE'
      ? `${distinctAgreeing} independent strategies agree on ${direction}. Evidence score: ${score}/100. No opposing active strategy signal.`
      : status === 'CONFLICT'
        ? direction === null
          ? `${buys.length} BUY and ${sells.length} SELL strategy signal(s) conflict. Wait for resolution.`
          : `${agreeing.length} strategies favour ${direction}, while ${opposing.length} active strategy signal(s) oppose it. Wait for resolution.`
        : status === 'PARTIAL_AGREEMENT'
          ? `${distinctAgreeing} independent strategy signal(s) currently agree. More confirmation is required before high confluence.`
          : 'No fresh, valid independent strategy signals are available.';
    return {
      symbol, direction, status, score,
      agreementCount: distinctAgreeing,
      eligibleCount: eligible.length,
      opposingCount: opposing.length,
      assessments: rows,
      explanation: names.length ? `${explanation} Supporting strategies: ${names.join(', ')}.` : explanation,
    };
  }).sort((a, b) => Number(b.status === 'HIGH_CONFLUENCE') - Number(a.status === 'HIGH_CONFLUENCE') || b.score - a.score);
}
