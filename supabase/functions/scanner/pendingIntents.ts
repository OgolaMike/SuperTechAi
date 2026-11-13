import { computeSignals } from "./strategy.ts";
import type { Candle } from "./deriv.ts";

type Direction = "BUY" | "SELL";
type OrderDirection = "BUY_LIMIT" | "SELL_LIMIT";

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

function executionContext(candlesByGranularity: Map<number, Candle[]>, nowEpoch: number) {
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

  const primary = stats.get(900)!;
  const primaryCandles = candlesByGranularity.get(900)!;
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
  const context = executionContext(candlesByGranularity, nowEpoch);
  if (!context) return [];
  const { direction, primary, trigger, m5Momentum } = context;
  const currentPrice = primary.last.close;
  const sign = direction === "BUY" ? 1 : -1;
  const midpoint = (primary.mean + currentPrice) / 2;
  const entries = [primary.mean, midpoint];
  const orderType: OrderDirection = direction === "BUY" ? "BUY_LIMIT" : "SELL_LIMIT";
  return entries
    .filter((entry, index) => entry > 0 && (direction === "BUY" ? entry < currentPrice : entry > currentPrice) &&
      (index === 0 || Math.abs(entry - entries[index - 1]) > primary.deviation * 0.01))
    .map((entry, index) => ({
      symbol, signalEpoch: trigger.signalEpoch, direction, orderType, entry,
      stopLoss: entry - sign * primary.deviation,
      takeProfit: entry + sign * primary.deviation * 2.5,
      currentPrice, timeframeAgreement: 3, momentumScore: m5Momentum, strengthScore: m5Momentum,
      strategyVersion: "m15-m5-m1-limit-v3" as const,
      idempotencyKey: `${symbol}|${orderType}|${trigger.signalEpoch}|L${index + 1}`,
    }))
    .filter((intent) => [intent.stopLoss, intent.takeProfit].every((v) => Number.isFinite(v) && v > 0));
}
