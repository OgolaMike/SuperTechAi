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
  { label: "H2", seconds: 7200 },
  { label: "H4", seconds: 14400 },
  { label: "D1", seconds: 86400 },
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

  const stopLoss = entry - sign * primary.deviation;
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
