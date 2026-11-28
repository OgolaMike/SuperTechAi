import type { Candle } from "./deriv.ts";

export type Direction = "BUY" | "SELL";
export type SignalStatus = "Open" | "TP1" | "TP2" | "TP3" | "Stopped";

export type Levels = {
  mean: number;
  deviation: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
};

export type Outcome = {
  tp1Epoch: number | null;
  tp2Epoch: number | null;
  tp3Epoch: number | null;
  slEpoch: number | null;
  status: SignalStatus;
  closed: boolean;
};

export type Signal = { direction: Direction; signalEpoch: number; levels: Levels; outcome: Outcome };

const SMA_PERIOD = 60;
const TP1_SIGMA = 1.5;
const TP2_SIGMA = 2.5;
const TP3_SIGMA = 3;
const STOP_SIGMA = 0.5;

function buildLevels(direction: Direction, mean: number, deviation: number, entry: number): Levels | null {
  if (!(deviation > 0)) return null;
  const sign = direction === "BUY" ? 1 : -1;
  const levels: Levels = {
    mean,
    deviation,
    entry,
    stopLoss: mean - sign * STOP_SIGMA * deviation,
    tp1: mean + sign * TP1_SIGMA * deviation,
    tp2: mean + sign * TP2_SIGMA * deviation,
    tp3: mean + sign * TP3_SIGMA * deviation,
  };
  // Every confirmed candle-close crossover must be recorded, even if price has
  // already moved beyond TP1. The next opposite crossover is a separate signal.
  return levels;
}

function evaluateOutcome(direction: Direction, levels: Levels, after: Candle[]): Outcome {
  const sign = direction === "BUY" ? 1 : -1;
  const reachedTarget = (close: number, target: number) => sign * (close - target) >= 0;
  const reachedStop = (close: number, stop: number) => sign * (close - stop) <= 0;

  let tp1Epoch: number | null = null;
  let tp2Epoch: number | null = null;
  let tp3Epoch: number | null = null;
  let slEpoch: number | null = null;

  for (const candle of after) {
    if (slEpoch !== null || tp3Epoch !== null) break;
    if (tp1Epoch === null && reachedTarget(candle.close, levels.tp1)) tp1Epoch = candle.epoch;
    if (tp2Epoch === null && reachedTarget(candle.close, levels.tp2)) tp2Epoch = candle.epoch;
    if (tp3Epoch === null && reachedTarget(candle.close, levels.tp3)) tp3Epoch = candle.epoch;
    if (tp3Epoch === null && reachedStop(candle.close, levels.stopLoss)) slEpoch = candle.epoch;
  }

  const status: SignalStatus =
    tp3Epoch !== null ? "TP3"
    : tp2Epoch !== null ? "TP2"
    : tp1Epoch !== null ? "TP1"
    : slEpoch !== null ? "Stopped"
    : "Open";

  return { tp1Epoch, tp2Epoch, tp3Epoch, slEpoch, status, closed: tp3Epoch !== null || slEpoch !== null };
}

// Confirmed-close rule: above SMA60 = BUY; below SMA60 = SELL. Only closed candles count.
export function computeSignals(
  candles: Candle[],
  granularity: number,
  nowEpoch: number,
): { signals: Signal[]; lastConfirmedEpoch: number | null } {
  const confirmed = candles.filter((candle) => candle.epoch + granularity <= nowEpoch);
  const stats = confirmed.map((_, index) => {
    if (index < SMA_PERIOD - 1) return null;
    const window = confirmed.slice(index - SMA_PERIOD + 1, index + 1).map((candle) => candle.close);
    const mean = window.reduce((sum, value) => sum + value, 0) / SMA_PERIOD;
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / SMA_PERIOD;
    return { mean, deviation: Math.sqrt(variance) };
  });

  const signals: Signal[] = [];
  let previousDirection: Direction | null = null;
  for (let i = SMA_PERIOD - 1; i < confirmed.length; i += 1) {
    const current = stats[i];
    if (!current) continue;
    const close = confirmed[i].close;
    const direction: Direction | null = close > current.mean ? "BUY" : close < current.mean ? "SELL" : null;
    if (!direction || direction === previousDirection) continue;
    const levels = buildLevels(direction, current.mean, current.deviation, close);
    if (!levels) continue;
    signals.push({
      direction,
      signalEpoch: confirmed[i].epoch,
      levels,
      outcome: evaluateOutcome(direction, levels, confirmed.slice(i + 1)),
    });
    previousDirection = direction;
  }

  return {
    signals,
    lastConfirmedEpoch: confirmed.length ? confirmed[confirmed.length - 1].epoch : null,
  };
}
