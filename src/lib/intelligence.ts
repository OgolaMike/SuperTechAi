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
  gradePercent: number;
  confirmationTimeframe: string;
  confirmationEpoch: number;
};

const PRIMARY_LABEL = 'M15';
const FRESH_PRIMARY_CANDLES = 8;
const NEUTRAL_BAND = 0.1;
const SMA_PERIOD = 60;

const CONFIRMATION_GRADES: Record<string, number> = {
  M1: 65,
  M5: 70,
  M15: 75,
  M30: 80,
  H1: 85,
  H4: 90,
  H8: 95,
  D1: 100,
};

const CLASSIFICATION_RANK: Record<Classification, number> = {
  'Strong alignment': 0,
  'Moderate alignment': 1,
  'Early signal': 2,
  'Counter-trend': 3,
};

function biasOfValues(close: number, mean: number, deviation: number): Bias {
  const gap = close - mean;
  const neutralBand = deviation * NEUTRAL_BAND;
  if (gap > neutralBand) return 'Bullish';
  if (gap < -neutralBand) return 'Bearish';
  return 'Neutral';
}

function biasOf(state: TfState): Bias {
  if (state.lastClose == null || state.currentSma == null || state.stdDev == null) {
    return 'No data';
  }
  return biasOfValues(state.lastClose, state.currentSma, state.stdDev);
}

function expectedBias(direction: Direction): Bias {
  return direction === 'BUY' ? 'Bullish' : 'Bearish';
}

/**
 * Finds the most recent confirmed candle on which this timeframe entered
 * the required direction. This measures when it joined alignment, rather
 * than treating the newest small-timeframe candle as a fresh confirmation.
 */
function latestAlignmentEpoch(state: TfState, expected: Bias): number | null {
  const candles = state.candles;
  if (candles.length < SMA_PERIOD) return null;

  let previousBias: Bias = 'No data';
  let latestEntryEpoch: number | null = null;
  const baseline = candles[0].close;
  let rollingSum = 0;
  let rollingSquares = 0;

  for (let index = 0; index < candles.length; index += 1) {
    const value = candles[index].close - baseline;
    rollingSum += value;
    rollingSquares += value * value;

    if (index >= SMA_PERIOD) {
      const removed = candles[index - SMA_PERIOD].close - baseline;
      rollingSum -= removed;
      rollingSquares -= removed * removed;
    }
    if (index < SMA_PERIOD - 1) continue;

    const meanOffset = rollingSum / SMA_PERIOD;
    const mean = baseline + meanOffset;
    const variance = Math.max(0, rollingSquares / SMA_PERIOD - meanOffset * meanOffset);
    const bias = biasOfValues(candles[index].close, mean, Math.sqrt(variance));

    if (bias === expected && previousBias !== expected && previousBias !== 'No data') {
      latestEntryEpoch = candles[index].epoch + state.granularity;
    }
    previousBias = bias;
  }

  // If the transition predates available history, treat it as older than every observed transition.
  return latestEntryEpoch ?? 0;
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

  const confirmations = TIMEFRAMES.map((timeframe) => {
    const state = states[timeframe.granularity];
    return {
      label: timeframe.label,
      epoch: state ? latestAlignmentEpoch(state, expected) : null,
    };
  });

  // A missing transition history is not allowed to invent a stronger grade.
  if (confirmations.some((item) => item.epoch == null)) return null;

  const latestConfirmation = confirmations.reduce((latest, item) =>
    item.epoch > latest.epoch ? item : latest,
  );
  const confirmationTimeframe = latestConfirmation.label;
  const confirmationEpoch = latestConfirmation.epoch;
  const gradePercent = CONFIRMATION_GRADES[confirmationTimeframe] ?? 65;

  const classification: Classification = 'Strong alignment';
  const dailyBias = readings.find((reading) => reading.label === 'D1')?.bias ?? 'No data';
  const explanation = [
    `Price crossed ${direction === 'BUY' ? 'above' : 'below'} its recent average on the 15-minute chart ${describeAge(nowEpoch - signal.signalEpoch)}.`,
    `All ${TIMEFRAMES.length} timeframes confirm this direction.`,
    `${confirmationTimeframe} was the latest timeframe to join alignment, giving this Super Signal a ${gradePercent}% confirmation grade.`,
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
    gradePercent,
    confirmationTimeframe,
    confirmationEpoch,
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
      b.gradePercent - a.gradePercent ||
      b.signalEpoch - a.signalEpoch,
  );
}
