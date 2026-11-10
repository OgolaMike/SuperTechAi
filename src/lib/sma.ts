import type { Candle } from './deriv';
import { buildLevels, evaluateOutcome, type Direction, type Signal } from './signals';
import { formatLocalDateTime } from './localTime';

export type Timeframe = {
  granularity: number;
  label: string;
  role: string;
  candleCount: number;
};

const CHART_HISTORY_CANDLES = 1440;

export const TIMEFRAMES: Timeframe[] = [
  { granularity: 900, label: 'M15', role: 'Primary signals', candleCount: CHART_HISTORY_CANDLES },
  { granularity: 1800, label: 'M30', role: 'Opportunity validation', candleCount: CHART_HISTORY_CANDLES },
  { granularity: 3600, label: 'H1', role: 'Trend confirmation', candleCount: CHART_HISTORY_CANDLES },
  { granularity: 7200, label: 'H2', role: 'Intermediate trend', candleCount: CHART_HISTORY_CANDLES },
  { granularity: 10800, label: 'H3', role: 'Major structure confirmation', candleCount: CHART_HISTORY_CANDLES },
  { granularity: 14400, label: 'H4', role: 'Major trend', candleCount: CHART_HISTORY_CANDLES },
  { granularity: 28800, label: 'H8', role: 'Higher-timeframe trend', candleCount: CHART_HISTORY_CANDLES },
  { granularity: 86400, label: 'D1', role: 'Highest timeframe · daily bias', candleCount: CHART_HISTORY_CANDLES },
];


export const NATIVE_TIMEFRAME_GRANULARITIES = new Set([900, 1800, 3600]);

// Build higher timeframes from hourly candles where a source interval is unavailable.
// Completed buckets require every hourly candle; the current bucket may remain partial/live.
export function aggregateHourlyCandles(hourly: Candle[], targetGranularity: number, nowEpoch = Math.floor(Date.now() / 1000)): Candle[] {
  const hoursPerCandle = targetGranularity / 3600;
  if (!Number.isInteger(hoursPerCandle) || hoursPerCandle < 2) return [];
  const buckets = new Map<number, Candle[]>();
  for (const candle of hourly) {
    const bucketEpoch = Math.floor(candle.epoch / targetGranularity) * targetGranularity;
    const bucket = buckets.get(bucketEpoch) ?? [];
    bucket.push(candle);
    buckets.set(bucketEpoch, bucket);
  }
  const currentBucket = Math.floor(nowEpoch / targetGranularity) * targetGranularity;
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).flatMap(([epoch, items]) => {
    const ordered = items.sort((a, b) => a.epoch - b.epoch);
    const isCurrent = epoch === currentBucket;
    if (!isCurrent && ordered.length !== hoursPerCandle) return [];
    if (ordered.length === 0) return [];
    return [{
      epoch,
      open: ordered[0].open,
      high: Math.max(...ordered.map((item) => item.high)),
      low: Math.min(...ordered.map((item) => item.low)),
      close: ordered[ordered.length - 1].close,
      symbol: ordered[0].symbol,
    }];
  });
}

export type Asset = {
  symbol: string;
  name: string;
  fullName: string;
  digits: number;
  exchange?: 'DERIV' | 'BINANCE';
};

export const DEFAULT_ASSET = 'R_25';
export const MAX_MONITORED_ASSETS = 10;

const SMA_PERIOD = 60;
const BB_DEVIATION = 2.5;

export type TfState = {
  granularity: number;
  label: string;
  role: string;
  candles: Candle[];
  chartCandles: Candle[];
  signals: Signal[];
  latestSignal: Signal | null;
  currentSma: number | null;
  stdDev: number | null;
  lastClose: number | null;
  bbHigh: number | null;
  bbLow: number | null;
  updatedEpoch: number | null;
};

export function emptyTfState(timeframe: Timeframe): TfState {
  return {
    granularity: timeframe.granularity,
    label: timeframe.label,
    role: timeframe.role,
    candles: [],
    chartCandles: [],
    signals: [],
    latestSignal: null,
    currentSma: null,
    stdDev: null,
    lastClose: null,
    bbHigh: null,
    bbLow: null,
    updatedEpoch: null,
  };
}

// A timeframe is stale when its newest confirmed candle is more than two periods old.
export function isStale(state: TfState, nowEpoch: number): boolean {
  if (state.updatedEpoch == null) return true;
  return nowEpoch - (state.updatedEpoch + state.granularity) > 2 * state.granularity;
}

type Stats = { mean: number | null; deviation: number | null };

function rollingStats(values: number[], period: number): Stats[] {
  return values.map((_, index) => {
    if (index < period - 1) return { mean: null, deviation: null };
    const window = values.slice(index - period + 1, index + 1);
    const mean = window.reduce((sum, value) => sum + value, 0) / period;
    const variance = window.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / period;
    return { mean, deviation: Math.sqrt(variance) };
  });
}

function crossDirection(previous: { close: number; mean: number }, current: { close: number; mean: number }): Direction | null {
  if (previous.close <= previous.mean && current.close > current.mean) return 'BUY';
  if (previous.close >= previous.mean && current.close < current.mean) return 'SELL';
  return null;
}

// Only candles whose period has fully closed are used; the forming candle is ignored.
export function computeTfState(timeframe: Timeframe, candles: Candle[], nowEpoch: number): TfState {
  const confirmed = [...candles]
    .sort((a, b) => a.epoch - b.epoch)
    .filter((candle) => candle.epoch + timeframe.granularity <= nowEpoch);
  const stats = rollingStats(confirmed.map((candle) => candle.close), SMA_PERIOD);
  const signals: Signal[] = [];

  for (let i = 1; i < confirmed.length; i += 1) {
    const previous = stats[i - 1];
    const current = stats[i];
    if (previous.mean == null || current.mean == null || current.deviation == null) continue;

    const direction = crossDirection(
      { close: confirmed[i - 1].close, mean: previous.mean },
      { close: confirmed[i].close, mean: current.mean },
    );
    if (!direction) continue;

    const levels = buildLevels(direction, current.mean, current.deviation, confirmed[i].close);
    if (!levels) continue;

    signals.push({
      direction,
      signalEpoch: confirmed[i].epoch,
      levels,
      outcome: evaluateOutcome(direction, levels, confirmed.slice(i + 1)),
    });
  }

  const lastIndex = confirmed.length - 1;
  const latest = stats[lastIndex];
  const hasBands = latest?.mean != null && latest.deviation != null;

  return {
    granularity: timeframe.granularity,
    label: timeframe.label,
    role: timeframe.role,
    candles: confirmed,
    chartCandles: [...candles].sort((a, b) => a.epoch - b.epoch),
    signals,
    latestSignal: signals[signals.length - 1] ?? null,
    currentSma: latest?.mean ?? null,
    stdDev: hasBands ? latest.deviation : null,
    lastClose: confirmed[lastIndex]?.close ?? null,
    bbHigh: hasBands ? latest.mean! + BB_DEVIATION * latest.deviation! : null,
    bbLow: hasBands ? latest.mean! - BB_DEVIATION * latest.deviation! : null,
    updatedEpoch: confirmed[lastIndex]?.epoch ?? null,
  };
}

export function mergeCandle(candles: Candle[], incoming: Candle): Candle[] {
  const index = candles.findIndex((candle) => candle.epoch === incoming.epoch);
  if (index === -1) {
    const next = [...candles, incoming].sort((a, b) => a.epoch - b.epoch);
    if (next.length > CHART_HISTORY_CANDLES + 60) {
      next.splice(0, next.length - (CHART_HISTORY_CANDLES + 60));
    }
    return next;
  }
  const next = [...candles];
  next[index] = incoming;
  return next;
}

export function formatPrice(price: number | null, digits = 4): string {
  if (price == null) return '—';
  return price.toFixed(digits);
}

export function formatDateTime(epoch: number | null): string {
  if (!epoch) return '—';
  return formatLocalDateTime(epoch * 1000);
}
