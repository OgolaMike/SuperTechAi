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
const FRESH_PRIMARY_CANDLES = 8;
const NEUTRAL_BAND = 0.1;
const SMA_PERIOD = 60;

// H4 owns the signal. Supporting frames contribute confirmation, never a competing direction.
const MIN_SUPPORTING_ALIGNMENT = 4;
const CONFIRMATION_GRADES: Record<string, number> = {
  D1: 65, H8: 70, H4: 100, H3: 75, H2: 80, H1: 85, M30: 90, M15: 95,
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
  const supportingReads = readings.filter((reading) => reading.label !== PRIMARY_LABEL);
  const supportingAligned = supportingReads.filter((reading) => reading.valid && reading.bias === expected).length;
  const higherTimeframes = supportingReads.filter((reading) => reading.label === 'D1' || reading.label === 'H8');
  const higherTimeframeOpposes = higherTimeframes.some((reading) => reading.valid && reading.bias !== 'Neutral' && reading.bias !== expected);

  // Keep H4 authoritative. Entry waits for at least four supporting frames and no higher-timeframe reversal warning.
  if (supportingReads.length !== 7 || supportingAligned < MIN_SUPPORTING_ALIGNMENT || higherTimeframeOpposes) return null;

  const confirmations = TIMEFRAMES.map((timeframe) => {
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
  const gradePercent = Math.round((supportingAligned / 7) * 100);

  const classification: Classification = supportingAligned >= 6 ? 'Strong alignment' : 'Moderate alignment';
  const dailyBias = readings.find((reading) => reading.label === 'D1')?.bias ?? 'No data';
  const explanation = [
    `H4 generated the primary ${direction} signal ${describeAge(nowEpoch - signal.signalEpoch)}.`,
    `${supportingAligned} of 7 supporting timeframes confirm H4; D1 and H8 are not opposing the direction.`,
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
    agreeing: supportingAligned + 1,
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
