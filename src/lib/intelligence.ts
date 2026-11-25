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

const PRIMARY_LABEL = 'H4';
const INTELLIGENCE_TIMEFRAMES = TIMEFRAMES;
const FRESH_PRIMARY_CANDLES = 8;
const NEUTRAL_BAND = 0.1;
const SMA_PERIOD = 60;

// H4 owns the signal. Supporting frames contribute confirmation, never a competing direction.
const MIN_DIRECTIONAL_ALIGNMENT = 5;
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
      const candleEpoch = candles[index].epoch;
      if (candleEpoch != null) latestEntryEpoch = candleEpoch + state.granularity;
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
  const readings = INTELLIGENCE_TIMEFRAMES.map((timeframe) => {
    const state = states[timeframe.granularity];
    const bias = state && !isStale(state, nowEpoch) ? biasOf(state) : ('No data' as Bias);
    return { label: timeframe.label, valid: bias !== 'No data', bias };
  });

  const primaryState = states[INTELLIGENCE_TIMEFRAMES.find((tf) => tf.label === PRIMARY_LABEL)!.granularity];
  const signal = primaryState?.latestSignal;
  if (!signal || signal.outcome.closed) return null;
  if (nowEpoch - signal.signalEpoch > FRESH_PRIMARY_CANDLES * primaryState.granularity) return null;

  const { direction, levels } = signal;
  const expected = expectedBias(direction);
  const supportingReads = readings.filter((reading) => reading.label !== PRIMARY_LABEL);
  const directionalReads = supportingReads.filter((reading) => reading.label !== 'M5' && reading.label !== 'M1');
  const microReads = supportingReads.filter((reading) => reading.label === 'M5' || reading.label === 'M1');
  const directionalAligned = directionalReads.filter((reading) => reading.valid && reading.bias === expected).length;
  const microAligned = microReads.filter((reading) => reading.valid && reading.bias === expected).length;
  const directionalOpposes = directionalReads.some((reading) => reading.valid && reading.bias !== 'Neutral' && reading.bias !== expected);

  // H4 owns direction. Five of seven D1-to-M15 frames must agree with no
  // opposing directional frame. M5/M1 only refine timing: at least one must
  // confirm H4, but they never vote the market direction or reverse it.
  if (supportingReads.length !== 9 || supportingReads.some((reading) => !reading.valid) || directionalAligned < MIN_DIRECTIONAL_ALIGNMENT || directionalOpposes || microAligned < 1) return null;

  const confirmations = INTELLIGENCE_TIMEFRAMES.map((timeframe) => {
    const state = states[timeframe.granularity];
    return {
      label: timeframe.label,
      epoch: state ? latestAlignmentEpoch(state, expected) : null,
    };
  });

  // A missing transition history is not allowed to invent a stronger grade.
  if (confirmations.some((item) => item.epoch == null)) return null;

  const validConfirmations = confirmations.filter(
    (item): item is { label: string; epoch: number } => item.epoch !== null,
  );
  const latestConfirmation = validConfirmations.reduce((latest, item) =>
    item.epoch > latest.epoch ? item : latest,
  );
  const confirmationTimeframe = latestConfirmation.label;
  const confirmationEpoch = latestConfirmation.epoch;
  const gradePercent = Math.round((directionalAligned / directionalReads.length) * 100);

  const classification: Classification = directionalAligned >= 6 ? 'Strong alignment' : 'Moderate alignment';
  const dailyBias = readings.find((reading) => reading.label === 'D1')?.bias ?? 'No data';
  const explanation = [
    `H4 generated the primary ${direction} signal ${describeAge(nowEpoch - signal.signalEpoch)}.`,
    `${directionalAligned} of 7 directional timeframes confirm H4, with no opposing directional frame.`,
    `M5/M1 confirm entry timing (${microAligned} of 2 agree) without changing the H4 direction.`,
    `${confirmationTimeframe} was the latest timeframe to join alignment, giving this H4 signal a ${gradePercent}% support grade.`,
  ].join(' ');

  return {
    symbol: asset.symbol,
    name: asset.name,
    digits: asset.digits,
    direction,
    classification,
    levels,
    dailyBias,
    agreeing: directionalAligned + microAligned + 1,
    validReads: INTELLIGENCE_TIMEFRAMES.length,
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
