import { getAiPatternScore, type SignalLearningModel } from './aiLearning';
import { TIMEFRAMES, type Asset, type TfState } from './sma';
import type { Direction } from './signals';

export type StopOrderStatus =
  | 'WAITING' | 'ENTRY HIT' | 'TARGET HIT' | 'STOP-LOSS HIT' | 'INVALIDATED' | 'EXPIRED';

export type PendingPatternType = 'TRIPLE BOTTOM' | 'TRIPLE TOP' | 'BREAK & RETEST';
export type PendingZone = { startEpoch: number; endEpoch: number; low: number; high: number };
export type PendingTimeframeReading = {
  label: string;
  bias: 'BUY' | 'SELL' | 'NEUTRAL' | 'BUILDING';
  momentum: 'RISING' | 'FALLING' | 'FLAT' | '—';
  bandPosition: 'UPPER' | 'MIDDLE' | 'LOWER' | '—';
  aligned: boolean | null;
};

export type M15StopIdea = {
  id: string;
  symbol: string;
  assetName: string;
  digits: number;
  type: 'BUY LIMIT' | 'SELL LIMIT';
  direction: Direction;
  patternType: PendingPatternType;
  zone: PendingZone;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  currentPrice: number;
  aiScore: number | null;
  timeframeAnalysis: PendingTimeframeReading[];
  timeframeAligned: number;
  timeframeAvailable: number;
  signalEpoch: number;
  entryHitEpoch: number | null;
  stopLossHitEpoch: number | null;
  takeProfitHitEpoch: number | null;
  status: StopOrderStatus;
  resolvedEpoch: number | null;
};

const M15 = 900;
const MAX_PENDING_AGE = 8 * M15;
const BB_PERIOD = 60;
const BB_DEVIATION = 2.5;
const SWING_LOOKBACK = 90;

type BandPoint = { mean: number; deviation: number; high: number; low: number };
type Pivot = { index: number; price: number; epoch: number };

function calculateBands(candles: TfState['candles']): Array<BandPoint | null> {
  return candles.map((_, index) => {
    if (index < BB_PERIOD - 1) return null;
    const window = candles.slice(index - BB_PERIOD + 1, index + 1);
    const mean = window.reduce((sum, candle) => sum + candle.close, 0) / BB_PERIOD;
    const variance = window.reduce((sum, candle) => sum + (candle.close - mean) ** 2, 0) / BB_PERIOD;
    const deviation = Math.sqrt(variance);
    return { mean, deviation, high: mean + BB_DEVIATION * deviation, low: mean - BB_DEVIATION * deviation };
  });
}

function findPivots(candles: TfState['candles'], kind: 'high' | 'low', from: number): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = Math.max(from + 1, 1); i < candles.length - 1; i += 1) {
    const value = kind === 'high' ? candles[i].high : candles[i].low;
    const before = kind === 'high' ? candles[i - 1].high : candles[i - 1].low;
    const after = kind === 'high' ? candles[i + 1].high : candles[i + 1].low;
    if (kind === 'high' ? value >= before && value > after : value <= before && value < after) {
      pivots.push({ index: i, price: value, epoch: candles[i].epoch });
    }
  }
  return pivots;
}

function buildTimeframeAnalysis(states: Record<number, TfState> | undefined, direction: Direction): PendingTimeframeReading[] {
  return [...TIMEFRAMES].reverse().map((timeframe): PendingTimeframeReading => {
    const state = states?.[timeframe.granularity];
    if (!state || state.candles.length < BB_PERIOD || state.lastClose == null
      || state.currentSma == null || state.stdDev == null) {
      return { label: timeframe.label, bias: 'BUILDING', momentum: '—', bandPosition: '—', aligned: null };
    }
    const close = state.lastClose;
    const bias = close > state.currentSma ? 'BUY' : close < state.currentSma ? 'SELL' : 'NEUTRAL';
    const recent = state.candles.slice(-6);
    const first = recent[0]?.close ?? close;
    const delta = close - first;
    const momentum = delta > 0 ? 'RISING' : delta < 0 ? 'FALLING' : 'FLAT';
    const upper = state.currentSma + BB_DEVIATION * state.stdDev;
    const lower = state.currentSma - BB_DEVIATION * state.stdDev;
    const bandPosition = close >= upper ? 'UPPER' : close <= lower ? 'LOWER' : 'MIDDLE';
    return { label: timeframe.label, bias, momentum, bandPosition, aligned: bias === direction };
  });
}

function getOrderType(direction: Direction): M15StopIdea['type'] {
  return direction === 'BUY' ? 'BUY LIMIT' : 'SELL LIMIT';
}

function evaluateOrder(
  direction: Direction, entry: number, stopLoss: number, takeProfit: number,
  candles: TfState['candles'], signalEpoch: number, nowEpoch: number,
) {
  let entryHitEpoch: number | null = null;
  let stopLossHitEpoch: number | null = null;
  let takeProfitHitEpoch: number | null = null;
  let status: StopOrderStatus = 'WAITING';
  let resolvedEpoch: number | null = null;

  for (const candle of candles) {
    if (candle.epoch <= signalEpoch) continue;
    const entered = direction === 'BUY' ? candle.low <= entry : candle.high >= entry;
    if (entryHitEpoch === null) {
      if (!entered) continue;
      entryHitEpoch = candle.epoch;
      status = 'ENTRY HIT';
    }
    const stopped = direction === 'BUY' ? candle.low <= stopLoss : candle.high >= stopLoss;
    const targeted = direction === 'BUY' ? candle.high >= takeProfit : candle.low <= takeProfit;
    if (stopped) {
      stopLossHitEpoch = candle.epoch; status = 'STOP-LOSS HIT'; resolvedEpoch = candle.epoch; break;
    }
    if (targeted) {
      takeProfitHitEpoch = candle.epoch; status = 'TARGET HIT'; resolvedEpoch = candle.epoch; break;
    }
  }
  if (status === 'WAITING' && nowEpoch - signalEpoch > MAX_PENDING_AGE) {
    status = 'EXPIRED'; resolvedEpoch = signalEpoch + MAX_PENDING_AGE;
  }
  return { entryHitEpoch, stopLossHitEpoch, takeProfitHitEpoch, status, resolvedEpoch };
}

function makeIdea(
  asset: Asset, direction: Direction, patternType: PendingPatternType, zone: PendingZone,
  entry: number, stopLoss: number, takeProfit: number, currentPrice: number,
  signalEpoch: number, candles: TfState['candles'], bands: Array<BandPoint | null>,
  aiModel: SignalLearningModel, nowEpoch: number, timeframeStates?: Record<number, TfState>,
): M15StopIdea | null {
  if (![entry, stopLoss, takeProfit].every((value) => Number.isFinite(value) && value > 0)) return null;
  const reward = direction === 'BUY' ? takeProfit - entry : entry - takeProfit;
  const risk = direction === 'BUY' ? entry - stopLoss : stopLoss - entry;
  // Stop-loss distance is derived from the Bollinger target at a 1:2 risk/reward ratio.
  if (!(reward > 0 && risk > 0) || !Number.isFinite(reward) || !Number.isFinite(risk)) return null;
  const band = bands[Math.min(candles.length - 1, Math.max(0, candles.findIndex((c) => c.epoch === signalEpoch)))] ?? bands[bands.length - 1];
  if (!band) return null;
  const levels = {
    mean: band.mean, deviation: band.deviation, entry, stopLoss,
    tp1: takeProfit, tp2: takeProfit, tp3: takeProfit,
  };
  const outcome = evaluateOrder(direction, entry, stopLoss, takeProfit, candles, signalEpoch, nowEpoch);
  const timeframeAnalysis = buildTimeframeAnalysis(timeframeStates, direction);
  const type = getOrderType(direction);
  return {
    id: `${asset.symbol}|${patternType}|${signalEpoch}`,
    symbol: asset.symbol, assetName: asset.fullName, digits: asset.digits,
    type, direction, patternType, zone, entry, stopLoss, takeProfit, currentPrice,
    aiScore: getAiPatternScore(aiModel, M15, direction, levels),
    timeframeAnalysis,
    timeframeAligned: timeframeAnalysis.filter((reading) => reading.aligned === true).length,
    timeframeAvailable: timeframeAnalysis.filter((reading) => reading.aligned !== null).length,
    signalEpoch, ...outcome,
  };
}

/** M15 reversal and continuation ideas. Suggestions only; no broker orders are submitted. */
export function buildM15StopOrderIdeas(
  assets: Asset[], statesBySymbol: Record<string, Record<number, TfState>>,
  prices: Record<string, number>, aiModel: SignalLearningModel, nowEpoch: number,
): M15StopIdea[] {
  const ideas: M15StopIdea[] = [];

  for (const asset of assets) {
    const m15 = statesBySymbol[asset.symbol]?.[M15];
    const currentPrice = prices[asset.symbol];
    if (!m15 || currentPrice == null || !Number.isFinite(currentPrice)) continue;
    const candles = m15.candles;
    if (candles.length < BB_PERIOD + 12) continue;
    const bands = calculateBands(candles);
    const lastIndex = candles.length - 1;
    const last = candles[lastIndex];
    const lastBand = bands[lastIndex];
    if (!lastBand || lastBand.deviation <= 0) continue;
    const from = Math.max(BB_PERIOD - 1, candles.length - SWING_LOOKBACK);
    const tolerance = lastBand.deviation * 0.45;
    const minGap = 3;

    // Three distinct band-side rejections clustered into a clearly marked price zone.
    const lows = findPivots(candles, 'low', from).filter((p) => {
      const band = bands[p.index];
      return band && p.price <= band.low + (band.deviation * 0.45);
    });
    const highs = findPivots(candles, 'high', from).filter((p) => {
      const band = bands[p.index];
      return band && p.price >= band.high - (band.deviation * 0.45);
    });

    const bottomGroup = lows.slice(-3);
    if (bottomGroup.length === 3 &&
        bottomGroup[1].index - bottomGroup[0].index >= minGap &&
        bottomGroup[2].index - bottomGroup[1].index >= minGap) {
      const prices3 = bottomGroup.map((p) => p.price);
      const zoneLow = Math.min(...prices3);
      const zoneHigh = Math.max(...prices3);
      const clustered = zoneHigh - zoneLow <= tolerance;
      const neckline = Math.max(...bottomGroup.map((p) => candles[p.index - 1]?.high ?? p.price));
      const confirmed = last.close > neckline && currentPrice > lastBand.mean;
      const entry = (zoneLow + zoneHigh) / 2;
      if (clustered && confirmed && entry < currentPrice) {
        const zone = { startEpoch: bottomGroup[0].epoch, endEpoch: last.epoch,
          low: zoneLow - tolerance * 0.15, high: zoneHigh + tolerance * 0.15 };
        const takeProfit = lastBand.high;
        const riskDistance = (takeProfit - entry) / 2;
        const stopLoss = entry - riskDistance;
        const idea = makeIdea(asset, 'BUY', 'TRIPLE BOTTOM', zone,
          entry, stopLoss, takeProfit, currentPrice, last.epoch, candles, bands, aiModel, nowEpoch, statesBySymbol[asset.symbol]);
        if (idea) ideas.push(idea);
      }
    }

    const topGroup = highs.slice(-3);
    if (topGroup.length === 3 &&
        topGroup[1].index - topGroup[0].index >= minGap &&
        topGroup[2].index - topGroup[1].index >= minGap) {
      const prices3 = topGroup.map((p) => p.price);
      const zoneLow = Math.min(...prices3);
      const zoneHigh = Math.max(...prices3);
      const clustered = zoneHigh - zoneLow <= tolerance;
      const neckline = Math.min(...topGroup.map((p) => candles[p.index - 1]?.low ?? p.price));
      const confirmed = last.close < neckline && currentPrice < lastBand.mean;
      const entry = (zoneLow + zoneHigh) / 2;
      if (clustered && confirmed && entry > currentPrice) {
        const zone = { startEpoch: topGroup[0].epoch, endEpoch: last.epoch,
          low: zoneLow - tolerance * 0.15, high: zoneHigh + tolerance * 0.15 };
        const takeProfit = lastBand.low;
        const riskDistance = (entry - takeProfit) / 2;
        const stopLoss = entry + riskDistance;
        const idea = makeIdea(asset, 'SELL', 'TRIPLE TOP', zone,
          entry, stopLoss, takeProfit, currentPrice, last.epoch, candles, bands, aiModel, nowEpoch, statesBySymbol[asset.symbol]);
        if (idea) ideas.push(idea);
      }
    }

    // Continuation: a 20-candle range is broken, then retested and rejected
    // from the other side. The zone is the broken support/resistance band.
    const rangeStart = Math.max(from, lastIndex - 24);
    const prior = candles.slice(rangeStart, lastIndex - 2);
    if (prior.length >= 12) {
      const resistance = Math.max(...prior.map((c) => c.high));
      const support = Math.min(...prior.map((c) => c.low));
      const retestTolerance = lastBand.deviation * 0.3;
      const breakBuy = candles[lastIndex - 2].close > resistance + retestTolerance * 0.15;
      const retestBuy = candles[lastIndex - 1].low <= resistance + retestTolerance &&
        candles[lastIndex - 1].low >= resistance - retestTolerance;
      if (breakBuy && retestBuy && last.close > resistance && currentPrice > lastBand.mean) {
        const entry = resistance;
        const zone = { startEpoch: candles[lastIndex - 2].epoch, endEpoch: last.epoch,
          low: resistance - retestTolerance, high: resistance + retestTolerance };
        const takeProfit = lastBand.high;
        const riskDistance = (takeProfit - entry) / 2;
        const stopLoss = entry - riskDistance;
        const idea = makeIdea(asset, 'BUY', 'BREAK & RETEST', zone,
          entry, stopLoss, takeProfit, currentPrice, last.epoch, candles, bands, aiModel, nowEpoch, statesBySymbol[asset.symbol]);
        if (idea) ideas.push(idea);
      }

      const breakSell = candles[lastIndex - 2].close < support - retestTolerance * 0.15;
      const retestSell = candles[lastIndex - 1].high >= support - retestTolerance &&
        candles[lastIndex - 1].high <= support + retestTolerance;
      if (breakSell && retestSell && last.close < support && currentPrice < lastBand.mean) {
        const entry = support;
        const zone = { startEpoch: candles[lastIndex - 2].epoch, endEpoch: last.epoch,
          low: support - retestTolerance, high: support + retestTolerance };
        const takeProfit = lastBand.low;
        const riskDistance = (entry - takeProfit) / 2;
        const stopLoss = entry + riskDistance;
        const idea = makeIdea(asset, 'SELL', 'BREAK & RETEST', zone,
          entry, stopLoss, takeProfit, currentPrice, last.epoch, candles, bands, aiModel, nowEpoch, statesBySymbol[asset.symbol]);
        if (idea) ideas.push(idea);
      }
    }
  }
  return ideas.sort((a, b) => b.signalEpoch - a.signalEpoch);
}

export function mergeTrackedStopOrders(previous: M15StopIdea[], updates: M15StopIdea[], limit = 1000): M15StopIdea[] {
  const merged = new Map(previous.map((idea) => [idea.id, idea]));
  for (const update of updates) {
    const existing = merged.get(update.id);
    merged.set(update.id, existing ? { ...existing, ...update } : update);
  }
  return [...merged.values()].sort((a, b) => b.signalEpoch - a.signalEpoch).slice(0, limit);
}
