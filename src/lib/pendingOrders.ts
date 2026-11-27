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

const PRIMARY_GRANULARITY = 1800;
const SIGNAL_MAX_AGE_BARS = 8;
const MIN_SUPPORTING_ALIGNMENT = 6;

function timeframeBias(state: TfState): Direction | 'NEUTRAL' | null {
  if (state.lastClose == null || state.currentSma == null || state.stdDev == null) return null;
  const neutral = state.stdDev * 0.1;
  const difference = state.lastClose - state.currentSma;
  if (difference > neutral) return 'BUY';
  if (difference < -neutral) return 'SELL';
  return 'NEUTRAL';
}

function makeLevels(direction: Direction, entry: number, deviation: number): Pick<SignalLevels, 'stopLoss' | 'tp3'> {
  const sign = direction === 'BUY' ? 1 : -1;
  return {
    stopLoss: entry - sign * deviation,
    tp3: entry + sign * deviation * 2.5,
  };
}

/**
 * Creates pending-order ideas from the official 13-timeframe analysis set.
 * The primary trigger is always a confirmed M30 signal; no sub-M30 timing frames are used. It never
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
      return { label: timeframe.label, bias: timeframeBias(state) };
    });
    if (readings.length !== TIMEFRAMES.length || readings.some((read) => read == null || read.bias == null)) continue;

    const directionRead = readings.find((read) => read?.label === 'H4');
    const direction = directionRead?.bias === 'BUY' || directionRead?.bias === 'SELL' ? directionRead.bias : null;
    if (direction == null) continue;

    const supportingReads = readings.filter((read) => read?.label !== 'H4');
    const supportingAligned = supportingReads.filter((read) => read?.bias === direction).length;
    const hasOpposition = supportingReads.some((read) => read?.bias === 'BUY' || read?.bias === 'SELL' ? read.bias !== direction : false);
    if (supportingAligned < MIN_SUPPORTING_ALIGNMENT || hasOpposition) continue;

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
        timeframeAgreement: supportingAligned + 1,
        signalEpoch: triggerSignal.signalEpoch,
        strengthScore: aiScore ?? 0,
      });
    }
  }

  return ideas.sort((a, b) => (b.aiScore ?? -1) - (a.aiScore ?? -1));
}
