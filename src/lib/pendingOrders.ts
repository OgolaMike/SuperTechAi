import { isStale, TIMEFRAMES, type Asset, type TfState } from './sma';
import { getAiPatternScore, type SignalLearningModel } from './aiLearning';
import type { Direction, SignalLevels } from './signals';

export type PendingOrderType = 'BUY LIMIT' | 'SELL LIMIT';

export type PendingOrderIdea = {
  id: string;
  symbol: string;
  assetName: string;
  digits: number;
  type: PendingOrderType;
  direction: Direction;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  currentPrice: number;
  aiScore: number | null;
  momentumScore: number | null;
  reason: string;
  timeframeAgreement: number;
  signalEpoch: number;
  strengthScore: number;
};

const PRIMARY_GRANULARITY = 900;
const SIGNAL_MAX_AGE_BARS = 8;

function timeframeBias(state: TfState): Direction | null {
  if (state.lastClose == null || state.currentSma == null || state.stdDev == null) return null;
  const neutral = state.stdDev * 0.1;
  const difference = state.lastClose - state.currentSma;
  if (difference > neutral) return 'BUY';
  if (difference < -neutral) return 'SELL';
  return null;
}

function makeLevels(direction: Direction, entry: number, deviation: number): Pick<SignalLevels, 'stopLoss' | 'tp3'> {
  const sign = direction === 'BUY' ? 1 : -1;
  return {
    stopLoss: entry - sign * deviation,
    tp3: entry + sign * deviation * 2.5,
  };
}

/**
 * Creates pending-order ideas from the official eight-timeframe analysis set.
 * The primary trigger is always a confirmed 15-minute crossover. It never
 * requests or uses any timeframe outside TIMEFRAMES and never places an order.
 */
export function buildPendingOrderIdeas(
  assets: Asset[],
  statesBySymbol: Record<string, Record<number, TfState>>,
  prices: Record<string, number>,
  aiModel: SignalLearningModel,
  nowEpoch: number,
): PendingOrderIdea[] {
  const ideas: PendingOrderIdea[] = [];

  for (const asset of assets) {
    const states = statesBySymbol[asset.symbol];
    const currentPrice = prices[asset.symbol];
    if (!states || currentPrice == null || !Number.isFinite(currentPrice)) continue;

    const readings = TIMEFRAMES.map((timeframe) => {
      const state = states[timeframe.granularity];
      if (!state || isStale(state, nowEpoch)) return null;
      return timeframeBias(state);
    });
    if (readings.length !== TIMEFRAMES.length) continue;

    const direction = readings[0];
    if (direction == null || !readings.every((bias) => bias === direction)) continue;

    const primary = states[PRIMARY_GRANULARITY];
    const triggerSignal = primary?.latestSignal;
    if (!primary || !triggerSignal || triggerSignal.direction !== direction || triggerSignal.outcome.closed) continue;
    if (nowEpoch - triggerSignal.signalEpoch > SIGNAL_MAX_AGE_BARS * PRIMARY_GRANULARITY) continue;
    if (primary.stdDev == null || primary.stdDev <= 0 || primary.currentSma == null) continue;

    const candidates: Array<{ type: PendingOrderType; entry: number; reason: string }> = [];
    if (direction === 'BUY' && primary.currentSma < currentPrice) {
      candidates.push({
        type: 'BUY LIMIT',
        entry: primary.currentSma,
        reason: 'The market is moving up. This order waits for price to pull back to its recent average.',
      });
    } else if (direction === 'SELL' && primary.currentSma > currentPrice) {
      candidates.push({
        type: 'SELL LIMIT',
        entry: primary.currentSma,
        reason: 'The market is moving down. This order waits for price to pull back to its recent average.',
      });
    }

    for (const candidate of candidates) {
      const levels = makeLevels(direction, candidate.entry, primary.stdDev);
      const scoreLevels: SignalLevels = {
        mean: primary.currentSma,
        deviation: primary.stdDev,
        entry: candidate.entry,
        stopLoss: levels.stopLoss,
        tp1: candidate.entry + (direction === 'BUY' ? 1 : -1) * primary.stdDev,
        tp2: candidate.entry + (direction === 'BUY' ? 2 : -2) * primary.stdDev,
        tp3: levels.tp3,
      };
      const aiScore = getAiPatternScore(aiModel, PRIMARY_GRANULARITY, direction, scoreLevels);
      ideas.push({
        id: `${asset.symbol}|${candidate.type}|${triggerSignal.signalEpoch}`,
        symbol: asset.symbol,
        assetName: asset.fullName,
        digits: asset.digits,
        type: candidate.type,
        direction,
        entry: candidate.entry,
        stopLoss: levels.stopLoss,
        takeProfit: levels.tp3,
        currentPrice,
        aiScore,
        momentumScore: null,
        reason: candidate.reason,
        timeframeAgreement: TIMEFRAMES.length,
        signalEpoch: triggerSignal.signalEpoch,
        strengthScore: aiScore ?? 0,
      });
    }
  }

  return ideas.sort((a, b) => (b.aiScore ?? -1) - (a.aiScore ?? -1));
}
