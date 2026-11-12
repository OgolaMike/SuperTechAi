import { TIMEFRAMES, type Asset, type TfState } from './sma';
import type { Direction } from './signals';

export type StopOrderStatus = 'WAITING' | 'ENTRY HIT' | 'TARGET HIT' | 'STOP-LOSS HIT' | 'INVALIDATED' | 'EXPIRED';
export type PendingPatternType = 'TRIPLE BOTTOM' | 'TRIPLE TOP';
export type PendingZone = { startEpoch: number; endEpoch: number; low: number; high: number };
export type PendingTimeframeReading = { label: string; bias: 'PRICE ACTION' | 'BUILDING'; momentum: 'RISING' | 'FALLING' | 'FLAT' | '—'; bandPosition: '—'; aligned: boolean | null };

export type M15StopIdea = {
  id: string; symbol: string; assetName: string; digits: number;
  type: 'BUY LIMIT' | 'SELL LIMIT'; direction: Direction;
  patternType: PendingPatternType; zone: PendingZone;
  entry: number; stopLoss: number; takeProfit: number; currentPrice: number;
  aiScore: null; timeframeAnalysis: PendingTimeframeReading[];
  timeframeAligned: 0; timeframeAvailable: 0;
  signalEpoch: number; entryHitEpoch: number | null; stopLossHitEpoch: number | null;
  takeProfitHitEpoch: number | null; status: StopOrderStatus; resolvedEpoch: number | null;
  granularity: number; timeframeLabel: string;
};

type Pivot = { index: number; price: number; epoch: number };
const MAX_PATTERN_AGE_BARS = 160;
const MIN_PIVOT_GAP = 3;

function pivots(candles: TfState['candles'], side: 'high' | 'low', from: number): Pivot[] {
  const result: Pivot[] = [];
  for (let i = Math.max(2, from); i < candles.length - 2; i += 1) {
    const price = candles[i][side];
    const left = candles.slice(i - 2, i).map(c => c[side]);
    const right = candles.slice(i + 1, i + 3).map(c => c[side]);
    if (side === 'low' ? left.every(v => price <= v) && right.every(v => price < v)
      : left.every(v => price >= v) && right.every(v => price > v)) {
      result.push({ index: i, price, epoch: candles[i].epoch });
    }
  }
  return result;
}

function resolveOutcome(direction: Direction, entry: number, stop: number, target: number,
  candles: TfState['candles'], signalEpoch: number, nowEpoch: number, granularity: number) {
  let entryHitEpoch: number | null = null;
  let stopLossHitEpoch: number | null = null;
  let takeProfitHitEpoch: number | null = null;
  let status: StopOrderStatus = 'WAITING';
  let resolvedEpoch: number | null = null;
  for (const candle of candles) {
    if (candle.epoch <= signalEpoch) continue;
    if (entryHitEpoch === null) {
      const entered = direction === 'BUY' ? candle.low <= entry : candle.high >= entry;
      if (!entered) continue;
      entryHitEpoch = candle.epoch;
      status = 'ENTRY HIT';
    }
    const stopped = direction === 'BUY' ? candle.low <= stop : candle.high >= stop;
    const targeted = direction === 'BUY' ? candle.high >= target : candle.low <= target;
    // Conservative ordering when both levels trade in one candle.
    if (stopped) { stopLossHitEpoch = candle.epoch; status = 'STOP-LOSS HIT'; resolvedEpoch = candle.epoch; break; }
    if (targeted) { takeProfitHitEpoch = candle.epoch; status = 'TARGET HIT'; resolvedEpoch = candle.epoch; break; }
  }
  if (status === 'WAITING' && nowEpoch - signalEpoch > MAX_PATTERN_AGE_BARS * granularity) {
    status = 'EXPIRED'; resolvedEpoch = signalEpoch + MAX_PATTERN_AGE_BARS * granularity;
  }
  return { entryHitEpoch, stopLossHitEpoch, takeProfitHitEpoch, status, resolvedEpoch };
}

function scanTimeframe(asset: Asset, state: TfState | undefined, currentPrice: number, nowEpoch: number): M15StopIdea[] {
  if (!state || state.candles.length < 30 || !Number.isFinite(currentPrice) || currentPrice <= 0) return [];
  const candles = state.candles;
  const granularity = state.granularity;
  const from = Math.max(2, candles.length - MAX_PATTERN_AGE_BARS - 2);
  const recentRanges = candles.slice(-20).map(c => Math.max(0, c.high - c.low));
  const avgRange = recentRanges.reduce((a, b) => a + b, 0) / Math.max(1, recentRanges.length);
  const tolerance = Math.max(avgRange * 0.35, currentPrice * 0.00005, 10 ** (-asset.digits) * 3);
  const ideas: M15StopIdea[] = [];

  for (const side of ['low', 'high'] as const) {
    const found = pivots(candles, side, from);
    if (found.length < 2) continue;
    // Use the latest two distinct swing points; older candidates are not mixed into a newer zone.
    const second = found[found.length - 1];
    const first = [...found.slice(0, -1)].reverse().find(p =>
      second.index - p.index >= MIN_PIVOT_GAP && Math.abs(second.price - p.price) <= tolerance * 2);
    if (!first) continue;
    const between = candles.slice(first.index + 1, second.index);
    if (!between.length) continue;
    const reaction = side === 'low'
      ? Math.max(...between.map(c => c.high)) - Math.max(first.price, second.price)
      : Math.min(first.price, second.price) - Math.min(...between.map(c => c.low));
    if (reaction < tolerance * 2) continue;

    const zoneLow = Math.min(first.price, second.price) - tolerance * 0.25;
    const zoneHigh = Math.max(first.price, second.price) + tolerance * 0.25;
    // A break through the far edge after the second touch invalidates the setup.
    const confirmationIndex = Math.min(second.index + 2, candles.length - 1);
    const confirmationEpoch = candles[confirmationIndex].epoch;
    const afterSecond = candles.slice(confirmationIndex + 1);
    const invalidated = side === 'low'
      ? afterSecond.some(c => c.close < zoneLow - tolerance)
      : afterSecond.some(c => c.close > zoneHigh + tolerance);
    if (invalidated) continue;

    // Keep the pending-order mapping explicit: support / swing lows = BUY LIMIT;
    // resistance / swing highs = SELL LIMIT. These are inverse, mirrored setups.
    const direction: Direction = side === 'low' ? 'BUY' : 'SELL';
    const entry = (zoneLow + zoneHigh) / 2;
    // Only stage the third-test limit while price is approaching from outside the zone.
    if (direction === 'BUY' ? currentPrice <= zoneHigh : currentPrice >= zoneLow) continue;
    const buffer = Math.max(tolerance * 0.5, avgRange * 0.2);
    const stopLoss = direction === 'BUY' ? zoneLow - buffer : zoneHigh + buffer;
    const risk = direction === 'BUY' ? entry - stopLoss : stopLoss - entry;
    if (!(risk > 0)) continue;
    const takeProfit = direction === 'BUY' ? entry + 3 * risk : entry - 3 * risk;
    if (!(takeProfit > 0)) continue;
    const patternType: PendingPatternType = side === 'low' ? 'TRIPLE BOTTOM' : 'TRIPLE TOP';
    const signalEpoch = confirmationEpoch;
    const outcome = resolveOutcome(direction, entry, stopLoss, takeProfit, candles, signalEpoch, nowEpoch, granularity);
    const recent = candles.slice(-6);
    const delta = recent.length > 1 ? recent[recent.length - 1].close - recent[0].close : 0;
    ideas.push({
      id: `${asset.symbol}|${granularity}|${patternType}|${first.epoch}|${second.epoch}`,
      symbol: asset.symbol, assetName: asset.fullName, digits: asset.digits,
      type: direction === 'BUY' ? 'BUY LIMIT' : 'SELL LIMIT', direction, patternType,
      zone: { startEpoch: first.epoch, endEpoch: candles[candles.length - 1].epoch, low: zoneLow, high: zoneHigh },
      entry, stopLoss, takeProfit, currentPrice, aiScore: null,
      timeframeAnalysis: [{ label: state.label, bias: 'PRICE ACTION', momentum: delta > 0 ? 'RISING' : delta < 0 ? 'FALLING' : 'FLAT', bandPosition: '—', aligned: null }],
      timeframeAligned: 0, timeframeAvailable: 0, signalEpoch, ...outcome,
      granularity, timeframeLabel: state.label,
    });
  }
  return ideas;
}

/** Pure price-action double-touch scanner: two swing lows stage a BUY LIMIT at support;
 * two swing highs stage a SELL LIMIT at resistance. Both wait for a possible third test
 * and use a 3R target. This scanner tracks ideas only; it never places broker orders. */
export function buildM15StopOrderIdeas(
  assets: Asset[], statesBySymbol: Record<string, Record<number, TfState>>,
  prices: Record<string, number>, _aiModel: unknown, nowEpoch: number,
): M15StopIdea[] {
  const ideas: M15StopIdea[] = [];
  for (const asset of assets) {
    const price = prices[asset.symbol];
    if (price == null) continue;
    for (const timeframe of TIMEFRAMES) {
      ideas.push(...scanTimeframe(asset, statesBySymbol[asset.symbol]?.[timeframe.granularity], price, nowEpoch));
    }
  }
  return ideas.sort((a, b) => b.signalEpoch - a.signalEpoch);
}

export function mergeTrackedStopOrders(previous: M15StopIdea[], updates: M15StopIdea[], limit = 2000): M15StopIdea[] {
  const merged = new Map(previous.map(idea => [idea.id, idea]));
  for (const update of updates) {
    const existing = merged.get(update.id);
    merged.set(update.id, existing && existing.status !== 'WAITING' ? existing : { ...existing, ...update });
  }
  return [...merged.values()].sort((a, b) => b.signalEpoch - a.signalEpoch).slice(0, limit);
}
