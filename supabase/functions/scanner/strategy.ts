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
const TP1_SIGMA = 1;
const TP2_SIGMA = 2;
const TP3_SIGMA = 2.5;
const STOP_SIGMA = 1;

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
  return sign * (levels.tp1 - entry) > 0 ? levels : null;
}

function evaluateOutcome(direction: Direction, levels: Levels, after: Candle[]): Outcome {
  let tp1Epoch: number | null = null;
  let tp2Epoch: number | null = null;
  let tp3Epoch: number | null = null;
  let slEpoch: number | null = null;

  for (const candle of after) {
    if (slEpoch !== null || tp3Epoch !== null) break;
    const high = candle.high ?? candle.close;
    const low = candle.low ?? candle.close;
    const stopTouched = direction === "BUY"
      ? low <= levels.stopLoss
      : high >= levels.stopLoss;
    const tp1Touched = direction === "BUY"
      ? high >= levels.tp1
      : low <= levels.tp1;
    const tp2Touched = direction === "BUY"
      ? high >= levels.tp2
      : low <= levels.tp2;
    const tp3Touched = direction === "BUY"
      ? high >= levels.tp3
      : low <= levels.tp3;

    // OHLC candles do not reveal intrabar ordering. If a candle touches both
    // stop and a target, resolve conservatively as a stop and credit no new TP.
    if (stopTouched && (tp1Touched || tp2Touched || tp3Touched)) {
      slEpoch = candle.epoch;
      break;
    }
    if (stopTouched) {
      slEpoch = candle.epoch;
      break;
    }
    if (tp1Epoch === null && tp1Touched) tp1Epoch = candle.epoch;
    if (tp2Epoch === null && tp2Touched) tp2Epoch = candle.epoch;
    if (tp3Touched) tp3Epoch = candle.epoch;
  }

  const status: SignalStatus =
    tp3Epoch !== null ? "TP3"
    : tp2Epoch !== null ? "TP2"
    : tp1Epoch !== null ? "TP1"
    : slEpoch !== null ? "Stopped"
    : "Open";

  return { tp1Epoch, tp2Epoch, tp3Epoch, slEpoch, status, closed: tp3Epoch !== null || slEpoch !== null };
}

// Same SMA 60 / Bollinger 2.5 crossover rules as the browser engine. Only closed candles count.
export function computeSignals(
  candles: Candle[],
  granularity: number,
  nowEpoch: number,
): { signals: Signal[]; lastConfirmedEpoch: number | null } {
  const confirmed = candles.filter((candle) => candle.epoch + granularity <= nowEpoch);
  // Rolling sums avoid rebuilding and reducing 60-element windows for every candle.
  // This keeps CPU use bounded when the scanner processes several markets per invocation.
  const rollingSum = new Array<number>(confirmed.length).fill(0);
  const rollingSquareSum = new Array<number>(confirmed.length).fill(0);
  let sum = 0;
  let squareSum = 0;
  for (let index = 0; index < confirmed.length; index += 1) {
    const close = confirmed[index].close;
    sum += close;
    squareSum += close * close;
    if (index >= SMA_PERIOD) {
      const expired = confirmed[index - SMA_PERIOD].close;
      sum -= expired;
      squareSum -= expired * expired;
    }
    rollingSum[index] = sum;
    rollingSquareSum[index] = squareSum;
  }
  const stats = confirmed.map((_, index) => {
    if (index < SMA_PERIOD - 1) return null;
    const mean = rollingSum[index] / SMA_PERIOD;
    const variance = Math.max(0, rollingSquareSum[index] / SMA_PERIOD - mean * mean);
    return { mean, deviation: Math.sqrt(variance) };
  });

  const signals: Signal[] = [];
  for (let i = 1; i < confirmed.length; i += 1) {
    const previous = stats[i - 1];
    const current = stats[i];
    if (!previous || !current) continue;
    const previousClose = confirmed[i - 1].close;
    const close = confirmed[i].close;
    let direction: Direction | null = null;
    if (previousClose <= previous.mean && close > current.mean) direction = "BUY";
    else if (previousClose >= previous.mean && close < current.mean) direction = "SELL";
    if (!direction) continue;
    const levels = buildLevels(direction, current.mean, current.deviation, close);
    if (!levels) continue;
    signals.push({
      direction,
      signalEpoch: confirmed[i].epoch,
      levels,
      outcome: evaluateOutcome(direction, levels, confirmed.slice(i + 1)),
    });
  }

  return {
    signals,
    lastConfirmedEpoch: confirmed.length ? confirmed[confirmed.length - 1].epoch : null,
  };
}
