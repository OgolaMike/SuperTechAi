import type { Candle } from './deriv';
import type { Asset, TfState } from './sma';

export type Direction = 'BUY' | 'SELL';
export type SignalStatus = 'Open' | 'TP1' | 'TP2' | 'TP3' | 'Stopped' | 'Reversed';

export type SignalLevels = {
  mean: number;
  deviation: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
};

export type SignalOutcome = {
  tp1Epoch: number | null;
  tp2Epoch: number | null;
  tp3Epoch: number | null;
  slEpoch: number | null;
  reversedEpoch: number | null;
  status: SignalStatus;
  closed: boolean;
};

export type Signal = {
  direction: Direction;
  signalEpoch: number;
  levels: SignalLevels;
  outcome: SignalOutcome;
};

export type SignalView = {
  key: string;
  symbol: string;
  assetName: string;
  digits: number;
  granularity: number;
  timeframe: string;
  signal: Signal;
};

const TP1_DEVIATIONS = 1;
const TP2_DEVIATIONS = 2;
const TP3_DEVIATIONS = 2.5;
const STOP_DEVIATIONS = 1;

// Levels are fixed on the signal candle. Returns null when entry is already beyond TP1.
export function buildLevels(
  direction: Direction,
  mean: number,
  deviation: number,
  entry: number,
): SignalLevels | null {
  if (!(deviation > 0)) return null;
  const sign = direction === 'BUY' ? 1 : -1;
  const levels: SignalLevels = {
    mean,
    deviation,
    entry,
    stopLoss: mean - sign * STOP_DEVIATIONS * deviation,
    tp1: mean + sign * TP1_DEVIATIONS * deviation,
    tp2: mean + sign * TP2_DEVIATIONS * deviation,
    tp3: mean + sign * TP3_DEVIATIONS * deviation,
  };
  return sign * (levels.tp1 - entry) > 0 ? levels : null;
}

// Checks confirmed candle closes only, in time order. The stop or TP3 closes the record.
export function evaluateOutcome(
  direction: Direction,
  levels: SignalLevels,
  candlesAfter: Candle[],
  reversalEpoch: number | null = null,
): SignalOutcome {
  const sign = direction === 'BUY' ? 1 : -1;
  const reachedTarget = (close: number, target: number) => sign * (close - target) >= 0;
  const reachedStop = (close: number, stop: number) => sign * (close - stop) <= 0;

  let tp1Epoch: number | null = null;
  let tp2Epoch: number | null = null;
  let tp3Epoch: number | null = null;
  let slEpoch: number | null = null;
  let reversedEpoch: number | null = null;

  for (const candle of candlesAfter) {
    if (slEpoch !== null || tp3Epoch !== null) break;
    if (tp1Epoch === null && reachedTarget(candle.close, levels.tp1)) tp1Epoch = candle.epoch;
    if (tp2Epoch === null && reachedTarget(candle.close, levels.tp2)) tp2Epoch = candle.epoch;
    if (tp3Epoch === null && reachedTarget(candle.close, levels.tp3)) tp3Epoch = candle.epoch;
    if (tp3Epoch === null && reachedStop(candle.close, levels.stopLoss)) slEpoch = candle.epoch;
    if (slEpoch !== null || tp3Epoch !== null) break;
    if (reversalEpoch !== null && candle.epoch >= reversalEpoch) {
      reversedEpoch = reversalEpoch;
      break;
    }
  }

  const status: SignalStatus =
    tp3Epoch !== null ? 'TP3'
    : slEpoch !== null ? 'Stopped'
    : reversedEpoch !== null ? 'Reversed'
    : tp2Epoch !== null ? 'TP2'
    : tp1Epoch !== null ? 'TP1'
    : 'Open';

  return {
    tp1Epoch,
    tp2Epoch,
    tp3Epoch,
    slEpoch,
    reversedEpoch,
    status,
    closed: tp3Epoch !== null || slEpoch !== null || reversedEpoch !== null,
  };
}

export function signalKey(symbol: string, granularity: number, signal: Signal): string {
  return `${symbol}|${granularity}|${signal.signalEpoch}|${signal.direction}`;
}

export function flattenSignals(
  assets: Asset[],
  states: Record<string, Record<number, TfState>>,
): SignalView[] {
  const assetBySymbol = new Map(assets.map((asset) => [asset.symbol, asset]));
  const views: SignalView[] = [];
  for (const [symbol, byGranularity] of Object.entries(states)) {
    const asset = assetBySymbol.get(symbol);
    for (const state of Object.values(byGranularity)) {
      for (const signal of state.signals) {
        views.push({
          key: signalKey(symbol, state.granularity, signal),
          symbol,
          assetName: asset?.name ?? symbol,
          digits: asset?.digits ?? 4,
          granularity: state.granularity,
          timeframe: state.label,
          signal,
        });
      }
    }
  }
  return views.sort((a, b) => b.signal.signalEpoch - a.signal.signalEpoch);
}
