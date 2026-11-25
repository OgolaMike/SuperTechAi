export type StrategyDirection = 'BUY' | 'SELL';
export type StrategyStatus = 'SIGNAL' | 'WAIT' | 'NO_SIGNAL' | 'STALE' | 'ERROR';

export type StrategyAssessment = {
  strategyId: string;
  strategyName: string;
  symbol: string;
  direction: StrategyDirection | null;
  status: StrategyStatus;
  signalEpoch: number;
  /** Strategy-owned strength from 0–100; never a win-probability estimate. */
  strength: number;
  /** Optional relative reliability weight, capped by the engine. */
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

function weightOf(item: StrategyAssessment): number {
  return Math.min(CONFLUENCE_CONFIG.maximumWeight, Math.max(0.1, item.weight ?? 1));
}

function isFreshSignal(item: StrategyAssessment, nowEpoch: number): boolean {
  return item.status === 'SIGNAL' && item.direction !== null &&
    Number.isFinite(item.signalEpoch) && item.signalEpoch <= nowEpoch &&
    nowEpoch - item.signalEpoch <= CONFLUENCE_CONFIG.maximumSignalAgeSeconds &&
    Number.isFinite(item.strength) && item.strength >= 0 && item.strength <= 100;
}

/** Compares independent engine outputs without changing their original decisions. */
export function evaluateStrategyConfluence(
  assessments: StrategyAssessment[],
  nowEpoch: number,
): ConfluenceResult[] {
  const bySymbol = new Map<string, StrategyAssessment[]>();
  for (const item of assessments) {
    if (!item.symbol || !item.strategyId) continue;
    const rows = bySymbol.get(item.symbol) ?? [];
    const index = rows.findIndex((row) => row.strategyId === item.strategyId);
    if (index >= 0) {
      if (item.signalEpoch > rows[index].signalEpoch) rows[index] = item;
    } else rows.push(item);
    bySymbol.set(item.symbol, rows);
  }

  return [...bySymbol.entries()].map(([symbol, rows]) => {
    const eligible = rows.filter((row) => isFreshSignal(row, nowEpoch));
    const buys = eligible.filter((row) => row.direction === 'BUY');
    const sells = eligible.filter((row) => row.direction === 'SELL');
    const buyWeight = buys.reduce((sum, row) => sum + weightOf(row), 0);
    const sellWeight = sells.reduce((sum, row) => sum + weightOf(row), 0);
    const totalWeight = buyWeight + sellWeight;
    const direction: StrategyDirection | null = buyWeight === sellWeight
      ? null : buyWeight > sellWeight ? 'BUY' : 'SELL';
    const agreeing = direction === 'BUY' ? buys : direction === 'SELL' ? sells : [];
    const opposing = direction === 'BUY' ? sells : direction === 'SELL' ? buys : [];
    const agreeingWeight = agreeing.reduce((sum, row) => sum + weightOf(row), 0);
    const agreeingStrength = agreeing.reduce((sum, row) => sum + row.strength * weightOf(row), 0);
    const directionalAgreement = totalWeight > 0 ? agreeingWeight / totalWeight : 0;
    const averageStrength = agreeingWeight > 0 ? agreeingStrength / agreeingWeight : 0;
    const score = Math.round(directionalAgreement * averageStrength);
    const agreementCount = new Set(agreeing.map((row) => row.strategyId)).size;
    const hasConflict = opposing.length > 0;
    const status: ConfluenceResult['status'] =
      hasConflict ? 'CONFLICT' :
      agreementCount >= CONFLUENCE_CONFIG.minimumIndependentStrategies && score >= CONFLUENCE_CONFIG.minimumScore
        ? 'HIGH_CONFLUENCE' :
      agreementCount > 0 ? 'PARTIAL_AGREEMENT' : 'WAIT';
    const supporting = agreeing.map((row) => row.strategyName);
    const explanation = status === 'HIGH_CONFLUENCE'
      ? `${agreementCount} independent strategies agree on ${direction}. Confluence evidence score: ${score}/100; no fresh opposing signal.`
      : status === 'CONFLICT'
        ? `${agreeing.length} strategy signal(s) favour ${direction ?? 'no clear direction'} and ${opposing.length} oppose it. Wait for the disagreement to resolve.`
        : status === 'PARTIAL_AGREEMENT'
          ? `${agreementCount} independent strategy signal(s) agree. More confirmation is needed before high confluence.`
          : 'No fresh, valid strategy signals are available.';
    return {
      symbol, direction, status, score, agreementCount,
      eligibleCount: eligible.length, opposingCount: opposing.length,
      assessments: rows,
      explanation: supporting.length ? `${explanation} Supporting strategies: ${supporting.join(', ')}.` : explanation,
    };
  }).sort((a, b) =>
    Number(b.status === 'HIGH_CONFLUENCE') - Number(a.status === 'HIGH_CONFLUENCE') ||
    b.score - a.score,
  );
}
