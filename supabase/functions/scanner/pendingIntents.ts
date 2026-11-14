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
  timeframeAgreement: 1;
  strategyVersion: string;
  idempotencyKey: string;
};

export type BackendLimitIntent = BaseIntent & {
  orderType: "BUY_LIMIT" | "SELL_LIMIT";
  momentumScore: number;
  strengthScore: number;
  strategyVersion: "m15-only-limit-v4";
};

const PRIMARY_FRAME = { label: "M15", seconds: 900 } as const;

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
  const candles = candlesByGranularity.get(PRIMARY_FRAME.seconds);
  if (!candles) return null;
  const value = latestStats(candles, PRIMARY_FRAME.seconds, nowEpoch);
  if (!value || nowEpoch - (value.last.epoch + PRIMARY_FRAME.seconds) > 2 * PRIMARY_FRAME.seconds) return null;
  stats.set(PRIMARY_FRAME.seconds, value);
  const difference = value.last.close - value.mean;
  const direction: Direction | null = difference > value.deviation * 0.1
    ? "BUY"
    : difference < -value.deviation * 0.1 ? "SELL" : null;
  if (!direction) return null;

  const primary = stats.get(PRIMARY_FRAME.seconds)!;
  const primaryCandles = candlesByGranularity.get(900)!;
  const trigger = computeSignals(primaryCandles, 900, nowEpoch).signals.slice(-1)[0];
  if (!trigger || trigger.direction !== direction || trigger.outcome.closed ||
      nowEpoch - trigger.signalEpoch > 8 * 900) return null;

  const m15Momentum = momentumStrength(candles, PRIMARY_FRAME.seconds, primary.deviation, direction, nowEpoch);
  if (m15Momentum < 40) return null;
  return { direction, primary, trigger, momentum: m15Momentum };
}

function momentumStrength(candles: Candle[], granularity: number, deviation: number, direction: Direction, nowEpoch: number): number {
  const recent = candles.filter((c) => c.epoch + granularity <= nowEpoch).sort((a, b) => a.epoch - b.epoch).slice(-5);
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

/** Returns pullback LIMIT proposals for one confirmed M15-only setup. */
export function buildBackendLimitIntent(symbol: string, candlesByGranularity: Map<number, Candle[]>, nowEpoch: number): BackendLimitIntent[] {
  const context = executionContext(candlesByGranularity, nowEpoch);
  if (!context) return [];
  const { direction, primary, trigger, momentum } = context;
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
      currentPrice, timeframeAgreement: 1 as const, momentumScore: momentum, strengthScore: momentum,
      strategyVersion: "m15-only-limit-v4" as const,
      idempotencyKey: `${symbol}|${orderType}|${trigger.signalEpoch}|L${index + 1}`,
    }))
    .filter((intent) => [intent.stopLoss, intent.takeProfit].every((v) => Number.isFinite(v) && v > 0));
}
