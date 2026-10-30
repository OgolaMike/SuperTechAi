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

const WEIGHTS: Record<string, number> = {
  D1: 1.5,
  H4: 2,
  H2: 1.5,
  H1: 1.5,
  M30: 1.5,
  M15: 3,
  M5: 1,
};

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

function opposedBias(direction: Direction): Bias {
  return direction === 'BUY' ? 'Bearish' : 'Bullish';
}

function describeAge(seconds: number): string {
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

function classificationNote(classification: Classification): string {
  switch (classification) {
    case 'Strong alignment':
      return 'Most timeframes point the same way, so this is a strong setup.';
    case 'Moderate alignment':
      return 'Many timeframes support this move, though not all of them yet.';
    case 'Early signal':
      return 'Only the short-term chart has moved so far. Waiting for more confirmation is sensible.';
    case 'Counter-trend':
      return 'The larger trend is moving the other way, so this setup carries extra risk.';
  }
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
  const opposed = opposedBias(direction);
  const validReadings = readings.filter((reading) => reading.valid);
  const weightOf = (label: string) => WEIGHTS[label] ?? 1;
  const totalWeight = validReadings.reduce((sum, reading) => sum + weightOf(reading.label), 0);
  const agreeingWeight = validReadings
    .filter((reading) => reading.bias === expected)
    .reduce((sum, reading) => sum + weightOf(reading.label), 0);
  const agreementRatio = totalWeight > 0 ? agreeingWeight / totalWeight : 0;

  const biasOfLabel = (label: string) => readings.find((reading) => reading.label === label)?.bias;
  const h1Bias = biasOfLabel('H1');
  const h4Bias = biasOfLabel('H4');
  const m30Bias = biasOfLabel('M30');

  let classification: Classification;
  if (h4Bias === opposed && h1Bias === opposed) {
    classification = 'Counter-trend';
  } else if (agreementRatio >= 0.7 && h1Bias === expected && m30Bias === expected) {
    classification = 'Strong alignment';
  } else if (agreementRatio >= 0.5) {
    classification = 'Moderate alignment';
  } else {
    classification = 'Early signal';
  }

  const higherAgreeing = readings
    .filter((reading) => reading.label !== PRIMARY_LABEL && reading.valid && reading.bias === expected)
    .map((reading) => reading.label);
  const higherOpposed = readings
    .filter((reading) => reading.label !== PRIMARY_LABEL && reading.valid && reading.bias === opposed)
    .map((reading) => reading.label);
  const dailyBias = biasOfLabel('D1') ?? 'No data';

  const sentences = [
    `Price crossed ${direction === 'BUY' ? 'above' : 'below'} its recent average on the 15-minute chart ${describeAge(nowEpoch - signal.signalEpoch)}.`,
    higherAgreeing.length > 0
      ? `Longer-term charts ${higherAgreeing.length === 1 ? 'agrees' : 'agree'} with this direction.`
      : 'Longer-term charts do not confirm this direction yet.',
    higherOpposed.length > 0 ? 'Some longer-term charts lean the other way.' : null,
    classificationNote(classification),
  ].filter((sentence): sentence is string => sentence !== null);

  return {
    symbol: asset.symbol,
    name: asset.name,
    digits: asset.digits,
    direction,
    classification,
    levels,
    dailyBias,
    agreeing: validReadings.filter((reading) => reading.bias === expected).length,
    validReads: validReadings.length,
    reads: readings.map((reading) => ({
      label: reading.label,
      bias: reading.bias,
      valid: reading.valid,
      agrees: reading.bias === expected,
    })),
    explanation: sentences.join(' '),
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
