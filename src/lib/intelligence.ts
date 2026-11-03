import { isStale, TIMEFRAMES, type Asset, type TfState } from './sma';
import type { Direction, SignalLevels } from './signals';

export type Bias = 'Bullish' | 'Bearish' | 'Neutral' | 'No data';
export type Classification =
  | 'Strong alignment'
  | 'Moderate alignment'
  | 'Early signal'
  | 'Counter-trend';

export type TimeframeRead = {
  label: string;
  bias: Bias;
  valid: boolean;
  agrees: boolean;
};

export type SuperSignal = {
  symbol: string;
  name: string;
  digits: number;
  direction: Direction;
  classification: Classification;
  levels: SignalLevels;
  dailyBias: Bias;
  agreeing: number;
  validReads: number;
  reads: TimeframeRead[];
  explanation: string;
  signalEpoch: number;
};

const PRIMARY_LABEL = 'M15';
const FRESH_PRIMARY_CANDLES = 8;
const NEUTRAL_BAND = 0.1;

const CLASSIFICATION_RANK: Record<Classification, number> = {
  'Strong alignment': 0,
  'Moderate alignment': 1,
  'Early signal': 2,
  'Counter-trend': 3,
};

function biasOf(state: TfState): Bias {
  if (state.lastClose == null || state.currentSma == null || state.stdDev == null) {
    return 'No data';
  }
  const gap = state.lastClose - state.currentSma;
  const band = state.stdDev * NEUTRAL_BAND;
  if (gap > band) return 'Bullish';
  if (gap < -band) return 'Bearish';
  return 'Neutral';
}

function expectedBias(direction: Direction): Bias {
  return direction === 'BUY' ? 'Bullish' : 'Bearish';
}

function describeAge(seconds: number): string {
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

function evaluateSymbol(
  asset: Asset,
  states: Record<number, TfState>,
  nowEpoch: number,
): SuperSignal | null {
  const readings = TIMEFRAMES.map((timeframe) => {
    const state = states[timeframe.granularity];
    const bias = state && !isStale(state, nowEpoch) ? biasOf(state) : ('No data' as Bias);
    return { label: timeframe.label, valid: bias !== 'No data', bias };
  });

  const primaryState = states[TIMEFRAMES.find((tf) => tf.label === PRIMARY_LABEL)!.granularity];
  const signal = primaryState?.latestSignal;
  if (!signal || signal.outcome.closed) return null;
  if (nowEpoch - signal.signalEpoch > FRESH_PRIMARY_CANDLES * primaryState.granularity) return null;

  const { direction, levels } = signal;
  const expected = expectedBias(direction);
  const allTimeframesAgree =
    readings.length === TIMEFRAMES.length &&
    readings.every((reading) => reading.valid && reading.bias === expected);

  // Super Signals are only published on complete, fresh 8/8 confluence.
  if (!allTimeframesAgree) return null;

  const classification: Classification = 'Strong alignment';
  const dailyBias = readings.find((reading) => reading.label === 'D1')?.bias ?? 'No data';
  const explanation = [
    `Price crossed ${direction === 'BUY' ? 'above' : 'below'} its recent average on the 15-minute chart ${describeAge(nowEpoch - signal.signalEpoch)}.`,
    `All ${TIMEFRAMES.length} timeframes confirm this direction.`,
  ].join(' ');

  return {
    symbol: asset.symbol,
    name: asset.name,
    digits: asset.digits,
    direction,
    classification,
    levels,
    dailyBias,
    agreeing: TIMEFRAMES.length,
    validReads: TIMEFRAMES.length,
    reads: readings.map((reading) => ({
      label: reading.label,
      bias: reading.bias,
      valid: reading.valid,
      agrees: reading.bias === expected,
    })),
    explanation,
    signalEpoch: signal.signalEpoch,
  };
}

export function buildSuperSignals(
  assets: Asset[],
  statesBySymbol: Record<string, Record<number, TfState>>,
  nowEpoch: number,
): SuperSignal[] {
  const signals: SuperSignal[] = [];
  for (const asset of assets) {
    const states = statesBySymbol[asset.symbol];
    if (!states) continue;
    const signal = evaluateSymbol(asset, states, nowEpoch);
    if (signal) signals.push(signal);
  }
  return signals.sort(
    (a, b) =>
      CLASSIFICATION_RANK[a.classification] - CLASSIFICATION_RANK[b.classification] ||
      b.signalEpoch - a.signalEpoch,
  );
}
