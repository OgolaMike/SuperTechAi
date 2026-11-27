import type { TfState } from '@/lib/sma';
import type { StrategyAssessment } from '@/lib/strategyConfluence';

export type StrategyOutcomeStatus =
  | 'WAITING ENTRY'
  | 'OPEN'
  | 'TARGET HIT'
  | 'STOP HIT'
  | 'EXPIRED'
  | 'UNTRACKED';

export type StrategyOutcome = {
  key: string;
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: string;
  signalEpoch: number;
  entryEpoch: number | null;
  resolvedEpoch: number | null;
  status: StrategyOutcomeStatus;
  entry: number | null;
  stopLoss: number | null;
  target: number | null;
  rMultiple: number | null;
  note: string;
};

export type StrategyPerformance = {
  strategyId: string;
  strategyName: string;
  sample: number;
  wins: number;
  losses: number;
  open: number;
  waiting: number;
  expired: number;
  winRate: number | null;
  averageR: number | null;
};

/**
 * Replays only fully closed candles after a strategy's own signal candle.
 * If stop and target are both touched inside one candle, stop is counted first.
 * This is a conservative candle-based simulation, never a broker fill record.
 */
export function evaluateStrategyOutcome(
  assessment: StrategyAssessment,
  state: TfState | undefined,
  nowEpoch: number,
): StrategyOutcome {
  const key = [assessment.strategyId, assessment.symbol, assessment.granularity, assessment.signalEpoch].join('|');
  const base = {
    key,
    strategyId: assessment.strategyId,
    strategyName: assessment.strategyName,
    symbol: assessment.symbol,
    timeframe: assessment.timeframe ?? '—',
    signalEpoch: assessment.signalEpoch,
    entry: assessment.entry ?? null,
    stopLoss: assessment.stopLoss ?? null,
    target: assessment.target ?? null,
    rMultiple: null as number | null,
    entryEpoch: null as number | null,
    resolvedEpoch: null as number | null,
  };
  if (!state || assessment.granularity == null || assessment.entry == null ||
      assessment.stopLoss == null || assessment.target == null ||
      !Number.isFinite(assessment.entry) || !Number.isFinite(assessment.stopLoss) ||
      !Number.isFinite(assessment.target) || assessment.entry <= 0 ||
      assessment.stopLoss <= 0 || assessment.target <= 0) {
    return { ...base, status: 'UNTRACKED', note: 'This strategy has no complete, independently defined entry/stop/target set.' };
  }

  const risk = Math.abs(assessment.entry - assessment.stopLoss);
  const reward = assessment.direction === 'BUY'
    ? assessment.target - assessment.entry
    : assessment.entry - assessment.target;
  if (!(risk > 0 && reward > 0)) {
    return { ...base, status: 'UNTRACKED', note: 'Invalid risk or target geometry; excluded from performance.' };
  }
  const candles = state.candles
    .filter((candle) => candle.epoch > assessment.signalEpoch && candle.epoch + state.granularity <= nowEpoch)
    .sort((a, b) => a.epoch - b.epoch);
  const isBuy = assessment.direction === 'BUY';
  const limitEntry = assessment.entryMode === 'LIMIT';
  let entryEpoch: number | null = limitEntry ? null : assessment.signalEpoch;
  let status: StrategyOutcomeStatus = limitEntry ? 'WAITING ENTRY' : 'OPEN';
  let resolvedEpoch: number | null = null;

  for (const candle of candles) {
    if (entryEpoch == null) {
      const touchedEntry = isBuy ? candle.low <= assessment.entry : candle.high >= assessment.entry;
      if (!touchedEntry) continue;
      entryEpoch = candle.epoch;
      status = 'OPEN';
    }
    const stopTouched = isBuy ? candle.low <= assessment.stopLoss : candle.high >= assessment.stopLoss;
    const targetTouched = isBuy ? candle.high >= assessment.target : candle.low <= assessment.target;
    if (stopTouched) {
      status = 'STOP HIT';
      resolvedEpoch = candle.epoch;
      break;
    }
    if (targetTouched) {
      status = 'TARGET HIT';
      resolvedEpoch = candle.epoch;
      break;
    }
  }

  if (limitEntry && entryEpoch == null &&
      nowEpoch - assessment.signalEpoch > 160 * state.granularity) {
    status = 'EXPIRED';
    resolvedEpoch = assessment.signalEpoch + 160 * state.granularity;
  }
  return {
    ...base,
    entryEpoch,
    resolvedEpoch,
    status,
    rMultiple: status === 'TARGET HIT' ? reward / risk : status === 'STOP HIT' ? -1 : null,
    note: status === 'TARGET HIT'
      ? 'Target reached on a later confirmed candle.'
      : status === 'STOP HIT'
        ? 'Stop reached on a later confirmed candle; stop wins same-candle ties.'
        : status === 'EXPIRED'
          ? 'Limit entry was not reached within 160 timeframe candles.'
          : status === 'WAITING ENTRY'
            ? 'Limit setup has not reached its entry price.'
            : 'No confirmed exit yet; this setup remains open.',
  };
}

export function summarizeStrategyPerformance(outcomes: StrategyOutcome[]): StrategyPerformance[] {
  const groups = new Map<string, StrategyOutcome[]>();
  for (const outcome of outcomes) {
    if (outcome.status === 'UNTRACKED') continue;
    const rows = groups.get(outcome.strategyId) ?? [];
    rows.push(outcome);
    groups.set(outcome.strategyId, rows);
  }
  return [...groups.entries()].map(([strategyId, rows]) => {
    const wins = rows.filter((row) => row.status === 'TARGET HIT');
    const losses = rows.filter((row) => row.status === 'STOP HIT');
    const resolved = wins.length + losses.length;
    const rValues = [...wins, ...losses].map((row) => row.rMultiple).filter((value): value is number => value != null);
    return {
      strategyId,
      strategyName: rows[0]?.strategyName ?? strategyId,
      sample: resolved,
      wins: wins.length,
      losses: losses.length,
      open: rows.filter((row) => row.status === 'OPEN').length,
      waiting: rows.filter((row) => row.status === 'WAITING ENTRY').length,
      expired: rows.filter((row) => row.status === 'EXPIRED').length,
      winRate: resolved ? wins.length / resolved * 100 : null,
      averageR: rValues.length ? rValues.reduce((sum, value) => sum + value, 0) / rValues.length : null,
    };
  }).sort((a, b) => b.sample - a.sample || a.strategyName.localeCompare(b.strategyName));
}
