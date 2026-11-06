import { getAiPatternScore, type SignalLearningModel } from './aiLearning';
import type { Asset, TfState } from './sma';
import type { Direction, Signal } from './signals';

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
  type: 'BUY STOP' | 'SELL STOP';
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

function evaluateOrder(
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
    const close = candle.close;
    const entered = direction === 'BUY' ? close >= entry : close <= entry;
    const stopped = direction === 'BUY' ? close <= stopLoss : close >= stopLoss;
    const targeted = direction === 'BUY' ? close >= takeProfit : close <= takeProfit;

    if (entryHitEpoch === null) {
      if (stopped) {
        stopLossHitEpoch = candle.epoch;
        status = 'INVALIDATED';
        resolvedEpoch = candle.epoch;
        break;
      }
      if (!entered) continue;
      entryHitEpoch = candle.epoch;
      status = 'ENTRY HIT';
    }

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

/** Builds and evaluates M15 stop-order ideas using confirmed M15 candles only. */
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

    for (const signal of m15.signals) {
      const { entry: originalEntry, tp1, tp3 } = signal.levels;
      if (!(tp1 > 0 && tp3 > 0 && originalEntry > 0)) continue;

      const type = signal.direction === 'BUY' ? 'BUY STOP' : 'SELL STOP';
      const aiScore = getAiPatternScore(aiModel, M15, signal.direction, signal.levels);
      const outcome = evaluateOrder(
        signal.direction,
        tp1,
        originalEntry,
        tp3,
        m15.candles,
        signal.signalEpoch,
        nowEpoch,
      );

      ideas.push({
        id: `${asset.symbol}|${type}|${signal.signalEpoch}`,
        symbol: asset.symbol,
        assetName: asset.fullName,
        digits: asset.digits,
        type,
        direction: signal.direction,
        entry: tp1,
        stopLoss: originalEntry,
        takeProfit: tp3,
        currentPrice,
        aiScore,
        signalEpoch: signal.signalEpoch,
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
