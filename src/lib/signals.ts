import type { Candle } from './deriv';
import { TIMEFRAMES, type Asset, type TfState } from './sma';

export type Direction = 'BUY' | 'SELL';
export type SignalStatus = 'Open' | 'TP3' | 'Stopped';

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

const TARGET_DEVIATIONS = 1.5;
const STOP_DEVIATIONS = 1;

// Levels are fixed on the signal candle. A confirmed crossover is never suppressed because price has moved beyond TP1.
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
    tp1: mean + sign * TARGET_DEVIATIONS * deviation,
    tp2: mean + sign * TARGET_DEVIATIONS * deviation,
    tp3: mean + sign * TARGET_DEVIATIONS * deviation,
  };
  return sign * (levels.tp1 - entry) > 0 ? levels : null;
}

// Checks confirmed candle closes only. One target at +1.5 deviation or stop at -1 deviation closes the record.
export function evaluateOutcome(
  direction: Direction,
  levels: SignalLevels,
  candlesAfter: Candle[],
): SignalOutcome {
  const sign = direction === 'BUY' ? 1 : -1;
  const reachedTarget = (close: number, target: number) => sign * (close - target) >= 0;
  const reachedStop = (close: number, stop: number) => sign * (close - stop) <= 0;

  let tp1Epoch: number | null = null;
  let tp2Epoch: number | null = null;
  let tp3Epoch: number | null = null;
  let slEpoch: number | null = null;

  for (const candle of candlesAfter) {
    if (slEpoch !== null || tp3Epoch !== null) break;
    if (reachedTarget(candle.close, levels.tp3)) tp3Epoch = candle.epoch;
    else if (reachedStop(candle.close, levels.stopLoss)) slEpoch = candle.epoch;
  }

  const status: SignalStatus =
    tp3Epoch !== null ? 'TP3'
    : slEpoch !== null ? 'Stopped'
    : 'Open';

  return {
    tp1Epoch,
    tp2Epoch,
    tp3Epoch,
    slEpoch,
    status,
    closed: tp3Epoch !== null || slEpoch !== null,
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
      const officialTimeframe = TIMEFRAMES.find((timeframe) =>
        timeframe.granularity === state.granularity && timeframe.label === state.label,
      );
      if (!officialTimeframe) continue;
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
