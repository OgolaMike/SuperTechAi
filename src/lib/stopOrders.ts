import { getAiPatternScore, type SignalLearningModel } from './aiLearning';
import type { Asset, TfState } from './sma';
import type { Direction } from './signals';

export type StopOrderStatus =
  | 'WAITING'
  | 'ENTRY HIT'
  | 'TARGET HIT'
  | 'STOP-LOSS HIT'
  | 'INVALIDATED'
  | 'EXPIRED';

export type M15StopIdea = {
  id: string;
  symbol: string;
  assetName: string;
  digits: number;
  type: 'BUY LIMIT' | 'SELL LIMIT';
  direction: Direction;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  currentPrice: number;
  aiScore: number | null;
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

type BandPoint = { mean: number; high: number; low: number };

function calculateBands(candles: TfState['candles']): Array<BandPoint | null> {
  return candles.map((_, index) => {
    if (index < BB_PERIOD - 1) return null;
    const window = candles.slice(index - BB_PERIOD + 1, index + 1);
    const mean = window.reduce((sum, candle) => sum + candle.close, 0) / BB_PERIOD;
    const variance = window.reduce((sum, candle) => sum + (candle.close - mean) ** 2, 0) / BB_PERIOD;
    const deviation = Math.sqrt(variance);
    return { mean, high: mean + BB_DEVIATION * deviation, low: mean - BB_DEVIATION * deviation };
  });
}

function getOrderType(direction: Direction): M15StopIdea['type'] {
  return direction === 'BUY' ? 'BUY LIMIT' : 'SELL LIMIT';
}

function evaluateOrder(
  type: M15StopIdea['type'],
  direction: Direction,
  entry: number,
  stopLoss: number,
  takeProfit: number,
  candles: TfState['candles'],
  signalEpoch: number,
  nowEpoch: number,
) {
  let entryHitEpoch: number | null = null;
  let stopLossHitEpoch: number | null = null;
  let takeProfitHitEpoch: number | null = null;
  let status: StopOrderStatus = 'WAITING';
  let resolvedEpoch: number | null = null;

  for (const candle of candles) {
    if (candle.epoch <= signalEpoch) continue;
    const isBuy = direction === 'BUY';
    const entered = type === 'BUY LIMIT' ? candle.low <= entry : candle.high >= entry;

    if (entryHitEpoch === null) {
      if (!entered) continue;
      entryHitEpoch = candle.epoch;
      status = 'ENTRY HIT';
    }

    const stopped = isBuy ? candle.low <= stopLoss : candle.high >= stopLoss;
    const targeted = isBuy ? candle.high >= takeProfit : candle.low <= takeProfit;

    // If both levels occur inside one candle, record the conservative stop-first outcome.
    if (stopped) {
      stopLossHitEpoch = candle.epoch;
      status = 'STOP-LOSS HIT';
      resolvedEpoch = candle.epoch;
      break;
    }
    if (targeted) {
      takeProfitHitEpoch = candle.epoch;
      status = 'TARGET HIT';
      resolvedEpoch = candle.epoch;
      break;
    }
  }

  if (status === 'WAITING' && nowEpoch - signalEpoch > MAX_PENDING_AGE) {
    status = 'EXPIRED';
    resolvedEpoch = signalEpoch + MAX_PENDING_AGE;
  }

  return { entryHitEpoch, stopLossHitEpoch, takeProfitHitEpoch, status, resolvedEpoch };
}

/**
 * Creates M15 proposals from a BB(60, 2.5) rejection and two-candle structure
 * confirmation. Stop-entry orders are disabled; only correctly positioned
 * BUY LIMIT and SELL LIMIT proposals are emitted.
 */
export function buildM15StopOrderIdeas(
  assets: Asset[],
  statesBySymbol: Record<string, Record<number, TfState>>,
  prices: Record<string, number>,
  aiModel: SignalLearningModel,
  nowEpoch: number,
): M15StopIdea[] {
  const ideas: M15StopIdea[] = [];

  for (const asset of assets) {
    const m15 = statesBySymbol[asset.symbol]?.[M15];
    const currentPrice = prices[asset.symbol];
    if (!m15 || currentPrice == null || !Number.isFinite(currentPrice)) continue;

    const candles = m15.candles;
    const bands = calculateBands(candles);

    // A band rejection must be followed immediately by two consecutive
    // lower lows (SELL) or higher highs (BUY) before a proposal is emitted.
    for (let i = BB_PERIOD + 1; i < candles.length; i += 1) {
      const crossIndex = i - 2;
      const previousBand = bands[crossIndex - 1];
      const crossBand = bands[crossIndex];
      const confirmBand = bands[i];
      if (!previousBand || !crossBand || !confirmBand) continue;

      const beforeCross = candles[crossIndex - 1];
      const cross = candles[crossIndex];
      const firstConfirm = candles[crossIndex + 1];
      const confirm = candles[i];

      const sellCross = beforeCross.close >= previousBand.high && cross.close < crossBand.high;
      const buyCross = beforeCross.close <= previousBand.low && cross.close > crossBand.low;
      const sellStructure = firstConfirm.low < cross.low && confirm.low < firstConfirm.low;
      const buyStructure = firstConfirm.high > cross.high && confirm.high > firstConfirm.high;

      const direction: Direction | null = sellCross && sellStructure ? 'SELL'
        : buyCross && buyStructure ? 'BUY' : null;
      if (!direction) continue;

      const entry = confirm.close;
      const takeProfit = confirmBand.mean;
      const reward = direction === 'BUY' ? takeProfit - entry : entry - takeProfit;
      if (!(entry > 0 && takeProfit > 0 && reward > 0)) continue;

      const risk = reward / 2;
      const stopLoss = direction === 'BUY' ? entry - risk : entry + risk;
      if (!(stopLoss > 0)) continue;

      if (direction === 'BUY' ? entry >= currentPrice : entry <= currentPrice) continue;
      const type = getOrderType(direction);
      const signalEpoch = confirm.epoch;
      const levels = {
        mean: confirmBand.mean,
        deviation: (confirmBand.high - confirmBand.mean) / BB_DEVIATION,
        entry,
        stopLoss,
        tp1: takeProfit,
        tp2: takeProfit,
        tp3: takeProfit,
      };
      const aiScore = getAiPatternScore(aiModel, M15, direction, levels);
      const outcome = evaluateOrder(
        type, direction, entry, stopLoss, takeProfit, candles, signalEpoch, nowEpoch,
      );

      ideas.push({
        id: `${asset.symbol}|${type}|${signalEpoch}|${direction}`,
        symbol: asset.symbol,
        assetName: asset.fullName,
        digits: asset.digits,
        type,
        direction,
        entry,
        stopLoss,
        takeProfit,
        currentPrice,
        aiScore,
        signalEpoch,
        ...outcome,
      });
    }
  }

  return ideas.sort((a, b) => b.signalEpoch - a.signalEpoch);
}

/** Merge live evaluations into a durable per-device order journal. */
export function mergeTrackedStopOrders(
  previous: M15StopIdea[],
  updates: M15StopIdea[],
  limit = 1000,
): M15StopIdea[] {
  const merged = new Map(previous.map((idea) => [idea.id, idea]));
  for (const update of updates) {
    const existing = merged.get(update.id);
    merged.set(update.id, existing ? { ...existing, ...update } : update);
  }
  return [...merged.values()]
    .sort((a, b) => b.signalEpoch - a.signalEpoch)
    .slice(0, limit);
}
