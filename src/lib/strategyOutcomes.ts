import type { TfState } from '@/lib/sma';
import type { StrategyAssessment } from '@/lib/strategyConfluence';

export type StrategyOutcomeStatus = 'WAITING ENTRY' | 'OPEN' | 'TARGET HIT' | 'STOP HIT' | 'EXPIRED' | 'UNTRACKED';
export type StrategyOutcome = {
  key: string; strategyId: string; strategyName: string; symbol: string; timeframe: string;
  signalEpoch: number; entryEpoch: number | null; resolvedEpoch: number | null;
  status: StrategyOutcomeStatus; entry: number | null; stopLoss: number | null; target: number | null;
  rMultiple: number | null; note: string;
};
export type StrategyPerformance = {
  strategyId: string; strategyName: string; sample: number; wins: number; losses: number;
  open: number; waiting: number; expired: number; winRate: number | null; averageR: number | null;
};

/** Replays fully closed candles after a strategy's own signal. Stop wins same-candle ties. */
export function evaluateStrategyOutcome(assessment: StrategyAssessment, state: TfState | undefined, nowEpoch: number): StrategyOutcome {
  const base = {
    key: [assessment.strategyId, assessment.symbol, assessment.granularity, assessment.signalEpoch].join('|'),
    strategyId: assessment.strategyId, strategyName: assessment.strategyName, symbol: assessment.symbol,
    timeframe: assessment.timeframe ?? '—', signalEpoch: assessment.signalEpoch,
    entry: assessment.entry ?? null, stopLoss: assessment.stopLoss ?? null, target: assessment.target ?? null,
    entryEpoch: null as number | null, resolvedEpoch: null as number | null, rMultiple: null as number | null,
  };
  if (!state || assessment.granularity == null || assessment.entry == null || assessment.stopLoss == null ||
      assessment.target == null || ![assessment.entry, assessment.stopLoss, assessment.target].every(Number.isFinite) ||
      assessment.entry <= 0 || assessment.stopLoss <= 0 || assessment.target <= 0) {
    return { ...base, status: 'UNTRACKED', note: 'No complete strategy-owned entry, stop and target; excluded from performance.' };
  }
  const risk = Math.abs(assessment.entry - assessment.stopLoss);
  const reward = assessment.direction === 'BUY' ? assessment.target - assessment.entry : assessment.entry - assessment.target;
  if (!(risk > 0 && reward > 0)) return { ...base, status: 'UNTRACKED', note: 'Invalid risk/target geometry; excluded from performance.' };

  const candles = state.candles.filter(c => c.epoch > assessment.signalEpoch && c.epoch + state.granularity <= nowEpoch)
    .sort((a, b) => a.epoch - b.epoch);
  const buy = assessment.direction === 'BUY';
  const isLimit = assessment.entryMode === 'LIMIT';
  let entryEpoch: number | null = isLimit ? null : assessment.signalEpoch;
  let status: StrategyOutcomeStatus = isLimit ? 'WAITING ENTRY' : 'OPEN';
  let resolvedEpoch: number | null = null;
  for (const candle of candles) {
    if (entryEpoch == null) {
      const touched = buy ? candle.low <= assessment.entry : candle.high >= assessment.entry;
      if (!touched) continue;
      entryEpoch = candle.epoch;
      status = 'OPEN';
    }
    const stopped = buy ? candle.low <= assessment.stopLoss : candle.high >= assessment.stopLoss;
    const targeted = buy ? candle.high >= assessment.target : candle.low <= assessment.target;
    if (stopped) { status = 'STOP HIT'; resolvedEpoch = candle.epoch; break; }
    if (targeted) { status = 'TARGET HIT'; resolvedEpoch = candle.epoch; break; }
  }
  if (isLimit && entryEpoch == null && nowEpoch - assessment.signalEpoch > 160 * state.granularity) {
    status = 'EXPIRED'; resolvedEpoch = assessment.signalEpoch + 160 * state.granularity;
  }
  return {
    ...base, entryEpoch, resolvedEpoch, status,
    rMultiple: status === 'TARGET HIT' ? reward / risk : status === 'STOP HIT' ? -1 : null,
    note: status === 'TARGET HIT' ? 'Target touched on a later confirmed candle.'
      : status === 'STOP HIT' ? 'Stop touched on a later confirmed candle; stop wins same-candle ties.'
      : status === 'EXPIRED' ? 'Limit entry was not reached within 160 timeframe candles.'
      : status === 'WAITING ENTRY' ? 'Limit setup has not reached its entry price.'
      : 'No confirmed exit yet; setup remains open.',
  };
}

export function summarizeStrategyPerformance(outcomes: StrategyOutcome[]): StrategyPerformance[] {
  const groups = new Map<string, StrategyOutcome[]>();
  for (const row of outcomes) {
    if (row.status === 'UNTRACKED') continue;
    const rows = groups.get(row.strategyId) ?? []; rows.push(row); groups.set(row.strategyId, rows);
  }
  return [...groups.entries()].map(([strategyId, rows]) => {
    const wins = rows.filter(row => row.status === 'TARGET HIT');
    const losses = rows.filter(row => row.status === 'STOP HIT');
    const sample = wins.length + losses.length;
    const rValues = [...wins, ...losses].map(row => row.rMultiple).filter((value): value is number => value != null);
    return {
      strategyId, strategyName: rows[0]?.strategyName ?? strategyId, sample, wins: wins.length, losses: losses.length,
      open: rows.filter(row => row.status === 'OPEN').length,
      waiting: rows.filter(row => row.status === 'WAITING ENTRY').length,
      expired: rows.filter(row => row.status === 'EXPIRED').length,
      winRate: sample ? wins.length / sample * 100 : null,
      averageR: rValues.length ? rValues.reduce((sum, value) => sum + value, 0) / rValues.length : null,
    };
  }).sort((a, b) => b.sample - a.sample || a.strategyName.localeCompare(b.strategyName));
}
