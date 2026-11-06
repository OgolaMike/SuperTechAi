import { computeSignals } from "./strategy.ts";
import type { Candle } from "./deriv.ts";

type Direction = "BUY" | "SELL";
type OrderDirection = "BUY_STOP" | "SELL_STOP" | "BUY_LIMIT" | "SELL_LIMIT";

type BaseIntent = {
  symbol: string;
  signalEpoch: number;
  direction: Direction;
  orderType: OrderDirection;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  currentPrice: number;
  timeframeAgreement: 3;
  strategyVersion: string;
  idempotencyKey: string;
};

export type BackendStopIntent = BaseIntent & {
  orderType: "BUY_STOP" | "SELL_STOP";
  strategyVersion: "m15-m5-m1-stop-v3";
};

export type BackendLimitIntent = BaseIntent & {
  orderType: "BUY_LIMIT" | "SELL_LIMIT";
  momentumScore: number;
  strengthScore: number;
  strategyVersion: "m15-m5-m1-limit-v3";
};

const FRAMES = [
  { label: "M1", seconds: 60 },
  { label: "M5", seconds: 300 },
  { label: "M15", seconds: 900 },
] as const;

function latestStats(candles: Candle[], granularity: number, nowEpoch: number) {
  const closed = candles.filter((c) => c.epoch + granularity <= nowEpoch).sort((a, b) => a.epoch - b.epoch);
  if (closed.length < 60) return null;
  const window = closed.slice(-60);
  const mean = window.reduce((sum, candle) => sum + candle.close, 0) / 60;
  const variance = window.reduce((sum, candle) => sum + (candle.close - mean) ** 2, 0) / 60;
  const deviation = Math.sqrt(variance);
  const last = closed[closed.length - 1];
  if (!(deviation > 0) || !Number.isFinite(last.close)) return null;
  return { closed, mean, deviation, last };
}

function executionContext(symbol: string, candlesByGranularity: Map<number, Candle[]>, nowEpoch: number) {
  const stats = new Map<number, NonNullable<ReturnType<typeof latestStats>>>();
  for (const frame of FRAMES) {
    const candles = candlesByGranularity.get(frame.seconds);
    if (!candles) return null;
    const value = latestStats(candles, frame.seconds, nowEpoch);
    if (!value || nowEpoch - (value.last.epoch + frame.seconds) > 2 * frame.seconds) return null;
    stats.set(frame.seconds, value);
  }
  const biases = FRAMES.map((frame) => {
    const value = stats.get(frame.seconds)!;
    const difference = value.last.close - value.mean;
    return difference > value.deviation * 0.1 ? "BUY" : difference < -value.deviation * 0.1 ? "SELL" : null;
  });
  const direction = biases[0] as Direction | null;
  if (!direction || !biases.every((bias) => bias === direction)) return null;

  const primaryCandles = candlesByGranularity.get(900)!;
  const primary = stats.get(900)!;
  const trigger = computeSignals(primaryCandles, 900, nowEpoch).signals.slice(-1)[0];
  if (!trigger || trigger.direction !== direction || trigger.outcome.closed ||
      nowEpoch - trigger.signalEpoch > 8 * 900) return null;

  const m5Momentum = momentumStrength(candlesByGranularity.get(300)!, stats.get(300)!.deviation, direction, nowEpoch);
  if (m5Momentum < 40) return null;
  return { direction, primary, trigger, m5Momentum };
}

function momentumStrength(candles: Candle[], deviation: number, direction: Direction, nowEpoch: number): number {
  const recent = candles.filter((c) => c.epoch + 300 <= nowEpoch).sort((a, b) => a.epoch - b.epoch).slice(-5);
  if (recent.length < 5 || !(deviation > 0)) return 0;
  const sign = direction === "BUY" ? 1 : -1;
  let aligned = 0, body = 0, range = 0, path = 0;
  for (let i = 0; i < recent.length; i += 1) {
    const candle = recent[i];
    const open = candle.open ?? candle.close;
    const high = candle.high ?? candle.close;
    const low = candle.low ?? candle.close;
    if (sign * (candle.close - open) > 0) aligned += 1;
    body += Math.abs(candle.close - open);
    range += Math.max(0, high - low);
    if (i > 0) path += Math.abs(candle.close - recent[i - 1].close);
  }
  if (aligned < 4) return 0;
  const net = sign * (recent[4].close - (recent[0].open ?? recent[0].close));
  const efficiency = path > 0 ? Math.abs(recent[4].close - recent[0].close) / path : 0;
  const bodyRatio = range > 0 ? body / range : 0;
  return Math.round(Math.min(1, efficiency / 0.8) * 35 + Math.min(1, bodyRatio / 0.7) * 30 + Math.min(1, Math.max(0, net / deviation) / 0.6) * 35);
}

/** Returns two distinct pullback LIMIT proposals for one confirmed M15/M5/M1 setup. */
export function buildBackendLimitIntent(symbol: string, candlesByGranularity: Map<number, Candle[]>, nowEpoch: number): BackendLimitIntent[] {
  const context = executionContext(symbol, candlesByGranularity, nowEpoch);
  if (!context) return [];
  const { direction, primary, trigger, m5Momentum } = context;
  const currentPrice = primary.last.close;
  const sign = direction === "BUY" ? 1 : -1;
  const midpoint = (primary.mean + currentPrice) / 2;
  const entries = [primary.mean, midpoint];
  const orderType = direction === "BUY" ? "BUY_LIMIT" : "SELL_LIMIT";
  return entries
    .filter((entry, index) => entry > 0 && (direction === "BUY" ? entry < currentPrice : entry > currentPrice) &&
      (index === 0 || Math.abs(entry - entries[index - 1]) > primary.deviation * 0.01))
    .map((entry, index) => ({
      symbol, signalEpoch: trigger.signalEpoch, direction, orderType, entry,
      stopLoss: entry - sign * primary.deviation,
      takeProfit: entry + sign * primary.deviation * 2.5,
      currentPrice, timeframeAgreement: 3, momentumScore: m5Momentum, strengthScore: m5Momentum,
      strategyVersion: "m15-m5-m1-limit-v3",
      idempotencyKey: `${symbol}|${orderType}|${trigger.signalEpoch}|L${index + 1}`,
    }))
    .filter((intent) => [intent.stopLoss, intent.takeProfit].every((v) => Number.isFinite(v) && v > 0));
}

/** Returns two distinct breakout STOP proposals for one confirmed M15/M5/M1 setup. */
export function buildBackendStopIntent(symbol: string, candlesByGranularity: Map<number, Candle[]>, nowEpoch: number): BackendStopIntent[] {
  const context = executionContext(symbol, candlesByGranularity, nowEpoch);
  if (!context) return [];
  const { direction, primary, trigger } = context;
  const recent = primary.closed.slice(-5);
  if (recent.length < 5 || recent.some((c) => !Number.isFinite(c.high) || !Number.isFinite(c.low))) return [];
  const swingHigh = Math.max(...recent.map((c) => c.high!));
  const swingLow = Math.min(...recent.map((c) => c.low!));
  const currentPrice = primary.last.close;
  const buffer = primary.deviation * 0.1;
  const sign = direction === "BUY" ? 1 : -1;
  const firstEntry = direction === "BUY"
    ? Math.max(swingHigh, currentPrice) + buffer
    : Math.min(swingLow, currentPrice) - buffer;
  const entries = [firstEntry, firstEntry + sign * primary.deviation * 0.5];
  const orderType = direction === "BUY" ? "BUY_STOP" : "SELL_STOP";
  return entries
    .filter((entry, index) => entry > 0 && (direction === "BUY" ? entry > currentPrice : entry < currentPrice) &&
      (index === 0 || Math.abs(entry - entries[index - 1]) > primary.deviation * 0.01))
    .map((entry, index) => ({
      symbol, signalEpoch: trigger.signalEpoch, direction, orderType, entry,
      stopLoss: primary.mean - sign * primary.deviation,
      takeProfit: entry + sign * primary.deviation * 2.5,
      currentPrice, timeframeAgreement: 3, strategyVersion: "m15-m5-m1-stop-v3",
      idempotencyKey: `${symbol}|${orderType}|${trigger.signalEpoch}|S${index + 1}`,
    }))
    .filter((intent) => [intent.stopLoss, intent.takeProfit].every((v) => Number.isFinite(v) && v > 0));
}

export type BackendReversalPendingOrder = {
  symbol: string;
  signalEpoch: number;
  direction: Direction;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  currentPrice: number;
  orderType: OrderDirection;
  strategyVersion: "bb60-2.5-two-candle-reversal-v1";
  idempotencyKey: string;
};

/** Mirrors the Pending Orders BB(60, 2.5) rejection + two-candle confirmation rule. */
export function buildBackendReversalPendingOrder(
  symbol: string,
  candles: Candle[],
  nowEpoch: number,
): BackendReversalPendingOrder | null {
  const closed = candles
    .filter((candle) => candle.epoch + 900 <= nowEpoch)
    .sort((a, b) => a.epoch - b.epoch);
  const i = closed.length - 1;
  if (i < 61) return null;

  const bandAt = (index: number) => {
    if (index < 59) return null;
    const window = closed.slice(index - 59, index + 1);
    const mean = window.reduce((sum, candle) => sum + candle.close, 0) / 60;
    const variance = window.reduce((sum, candle) => sum + (candle.close - mean) ** 2, 0) / 60;
    const deviation = Math.sqrt(variance);
    return { mean, high: mean + 2.5 * deviation, low: mean - 2.5 * deviation };
  };

  const crossIndex = i - 2;
  const previousBand = bandAt(crossIndex - 1);
  const crossBand = bandAt(crossIndex);
  const targetBand = bandAt(i);
  if (!previousBand || !crossBand || !targetBand) return null;

  const beforeCross = closed[crossIndex - 1];
  const cross = closed[crossIndex];
  const firstConfirm = closed[crossIndex + 1];
  const confirm = closed[i];
  if (cross.low == null || firstConfirm.low == null || confirm.low == null ||
      cross.high == null || firstConfirm.high == null || confirm.high == null) return null;
  const sellCross = beforeCross.close >= previousBand.high && cross.close < crossBand.high;
  const buyCross = beforeCross.close <= previousBand.low && cross.close > crossBand.low;
  const sellStructure = firstConfirm.low < cross.low && confirm.low < firstConfirm.low;
  const buyStructure = firstConfirm.high > cross.high && confirm.high > firstConfirm.high;
  const direction: Direction | null = sellCross && sellStructure ? "SELL"
    : buyCross && buyStructure ? "BUY" : null;
  if (!direction) return null;

  const entry = confirm.close;
  const takeProfit = targetBand.mean;
  const reward = direction === "BUY" ? takeProfit - entry : entry - takeProfit;
  if (!(entry > 0 && takeProfit > 0 && reward > 0)) return null;
  const stopLoss = direction === "BUY" ? entry - reward / 2 : entry + reward / 2;
  if (!(stopLoss > 0)) return null;
  const orderType: OrderDirection = direction === "BUY" ? "BUY_STOP" : "SELL_STOP";
  const signalEpoch = confirm.epoch;
  return {
    symbol, signalEpoch, direction, orderType, entry, stopLoss, takeProfit,
    currentPrice: confirm.close, strategyVersion: "bb60-2.5-two-candle-reversal-v1",
    idempotencyKey: `${symbol}|${orderType}|${signalEpoch}|BB25REV`,
  };
}
