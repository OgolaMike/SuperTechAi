import { computeSignals } from "./strategy.ts";
import type { Candle } from "./deriv.ts";

export type BackendStopIntent = {
  symbol: string;
  signalEpoch: number;
  direction: "BUY" | "SELL";
  orderType: "BUY_STOP" | "SELL_STOP";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  currentPrice: number;
  timeframeAgreement: 8;
  strategyVersion: "eight-tf-stop-v1";
  idempotencyKey: string;
};

const FRAMES = [
  { label: "M1", seconds: 60 },
  { label: "M5", seconds: 300 },
  { label: "M15", seconds: 900 },
  { label: "M30", seconds: 1800 },
  { label: "H1", seconds: 3600 },
  { label: "H4", seconds: 14400 },
  { label: "D1", seconds: 86400 },
  { label: "W1", seconds: 604800 },
] as const;

function latestStats(candles: Candle[], granularity: number, nowEpoch: number) {
  const closed = candles
    .filter((c) => c.epoch + granularity <= nowEpoch)
    .sort((a, b) => a.epoch - b.epoch);
  if (closed.length < 60) return null;
  const window = closed.slice(-60);
  const mean = window.reduce((sum, candle) => sum + candle.close, 0) / 60;
  const variance = window.reduce((sum, candle) => sum + (candle.close - mean) ** 2, 0) / 60;
  const deviation = Math.sqrt(variance);
  const last = closed[closed.length - 1];
  if (!(deviation > 0) || !Number.isFinite(last.close)) return null;
  return { closed, mean, deviation, last };
}

/**
 * Backend counterpart of the existing stop-order idea rules.
 * It intentionally creates STOP orders only. LIMIT orders remain unavailable
 * until the M5 momentum + trained-AI gate is implemented and verified server-side.
 */
export function buildBackendStopIntent(
  symbol: string,
  candlesByGranularity: Map<number, Candle[]>,
  nowEpoch: number,
): BackendStopIntent | null {
  const stats = new Map<number, ReturnType<typeof latestStats>>();
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
    const neutral = value.deviation * 0.1;
    return difference > neutral ? "BUY" : difference < -neutral ? "SELL" : null;
  });
  const direction = biases[0];
  if (!direction || !biases.every((bias) => bias === direction)) return null;

  const primaryCandles = candlesByGranularity.get(900)!;
  const primary = stats.get(900)!;
  const signals = computeSignals(primaryCandles, 900, nowEpoch).signals;
  const trigger = signals[signals.length - 1];
  if (!trigger || trigger.direction !== direction || trigger.outcome.closed) return null;
  if (nowEpoch - trigger.signalEpoch > 8 * 900) return null;

  const recent = primary.closed.slice(-5);
  if (recent.length < 5) return null;
  if (recent.some((c) => !Number.isFinite(c.high) || !Number.isFinite(c.low))) return null;
  const swingHigh = Math.max(...recent.map((c) => c.high!));
  const swingLow = Math.min(...recent.map((c) => c.low!));
  const currentPrice = primary.last.close;
  const buffer = primary.deviation * 0.1;
  const sign = direction === "BUY" ? 1 : -1;
  const entry = direction === "BUY"
    ? Math.max(swingHigh, currentPrice) + buffer
    : Math.min(swingLow, currentPrice) - buffer;
  if (!(entry > 0) || (direction === "BUY" ? entry <= currentPrice : entry >= currentPrice)) return null;

  // Match makeLevels() in src/lib/pendingOrders.ts: SL is anchored to the
  // M15 SMA, while the single 2.5σ target is measured from the entry.
  const stopLoss = primary.mean - sign * primary.deviation;
  const takeProfit = entry + sign * primary.deviation * 2.5;
  if (![stopLoss, takeProfit].every((v) => Number.isFinite(v) && v > 0)) return null;

  const orderType = direction === "BUY" ? "BUY_STOP" : "SELL_STOP";
  return {
    symbol,
    signalEpoch: trigger.signalEpoch,
    direction,
    orderType,
    entry,
    stopLoss,
    takeProfit,
    currentPrice,
    timeframeAgreement: 8,
    strategyVersion: "eight-tf-stop-v1",
    idempotencyKey: `${symbol}|${orderType}|${trigger.signalEpoch}`,
  };
}


export type BackendLimitIntent = {
  symbol: string; signalEpoch: number; direction: "BUY" | "SELL";
  orderType: "BUY_LIMIT" | "SELL_LIMIT"; entry: number; stopLoss: number;
  takeProfit: number; currentPrice: number; timeframeAgreement: 8;
  momentumScore: number; strengthScore: number; strategyVersion: "eight-tf-limit-v1";
  idempotencyKey: string;
};

function momentumStrength(candles: Candle[], deviation: number, direction: "BUY" | "SELL", nowEpoch: number): number {
  const recent = candles.filter((c) => c.epoch + 300 <= nowEpoch).slice(-5);
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
  const net = sign * (recent[4].close - recent[0].open);
  const efficiency = path > 0 ? Math.abs(recent[4].close - recent[0].close) / path : 0;
  const bodyRatio = range > 0 ? body / range : 0;
  return Math.round(Math.min(1, efficiency / 0.8) * 35 + Math.min(1, bodyRatio / 0.7) * 30 + Math.min(1, Math.max(0, net / deviation) / 0.6) * 35);
}

/** Server-side signal-only LIMIT proposal. It never places a broker order. */
export function buildBackendLimitIntent(symbol: string, candlesByGranularity: Map<number, Candle[]>, nowEpoch: number): BackendLimitIntent | null {
  const stats = new Map<number, ReturnType<typeof latestStats>>();
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
  const direction = biases[0];
  if (!direction || !biases.every((bias) => bias === direction)) return null;
  const primary = stats.get(900)!;
  const trigger = computeSignals(candlesByGranularity.get(900)!, 900, nowEpoch).signals.slice(-1)[0];
  if (!trigger || trigger.direction !== direction || trigger.outcome.closed || nowEpoch - trigger.signalEpoch > 8 * 900) return null;
  const m5 = computeSignals(candlesByGranularity.get(300)!, 300, nowEpoch).signals.slice(-1)[0];
  if (!m5 || m5.direction !== direction || m5.outcome.closed || nowEpoch - m5.signalEpoch > 6 * 300) return null;
  const currentPrice = primary.last.close;
  const entry = primary.mean;
  if (!(entry > 0) || (direction === "BUY" ? entry >= currentPrice : entry <= currentPrice)) return null;
  const momentumScore = momentumStrength(candlesByGranularity.get(300)!, stats.get(300)!.deviation, direction, nowEpoch);
  if (momentumScore < 40) return null;
  const sign = direction === "BUY" ? 1 : -1;
  const stopLoss = entry - sign * primary.deviation;
  const takeProfit = entry + sign * primary.deviation * 2.5;
  if (![stopLoss, takeProfit].every((v) => Number.isFinite(v) && v > 0)) return null;
  const orderType = direction === "BUY" ? "BUY_LIMIT" : "SELL_LIMIT";
  return {
    symbol, signalEpoch: trigger.signalEpoch, direction, orderType, entry, stopLoss, takeProfit, currentPrice,
    timeframeAgreement: 8, momentumScore, strengthScore: momentumScore, strategyVersion: "eight-tf-limit-v1",
    idempotencyKey: symbol + "|" + orderType + "|" + trigger.signalEpoch,
  };
}
