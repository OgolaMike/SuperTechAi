import { isStale, TIMEFRAMES, type Asset, type TfState } from './sma';
import { getAiPatternScore, type SignalLearningModel } from './aiLearning';
import type { Direction, SignalLevels } from './signals';

export type PendingOrderType = 'BUY STOP' | 'SELL STOP' | 'BUY LIMIT' | 'SELL LIMIT';

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
};

const PRIMARY_GRANULARITY = 300;
const SIGNAL_MAX_AGE_BARS = 8;
const SWING_LOOKBACK = 5;
const M5_GRANULARITY = 300;
const M5_LOOKBACK = 5;
const M5_MIN_DIRECTIONAL_CANDLES = 4;
const M5_MIN_EFFICIENCY = 0.62;
const M5_MIN_BODY_RATIO = 0.5;
const M5_MIN_NORMALIZED_MOVE = 0.3;
const M5_SIGNAL_MAX_AGE_BARS = 6;
const LIMIT_MIN_AI_SCORE = 35;

type M5LimitGate = {
  approved: boolean;
  aiScore: number | null;
  momentumScore: number | null;
  reason: string;
};

function evaluateM5LimitGate(
  state: TfState | undefined,
  direction: Direction,
  aiModel: SignalLearningModel,
  nowEpoch: number,
): M5LimitGate {
  const reject = (reason: string): M5LimitGate => ({
    approved: false,
    aiScore: null,
    momentumScore: null,
    reason,
  });

  if (!state || isStale(state, nowEpoch)) return reject('M5 data is missing or stale.');
  const signal = state.latestSignal;
  if (!signal || signal.direction !== direction || signal.outcome.closed) {
    return reject('M5 has no active signal in the same direction.');
  }
  if (nowEpoch - signal.signalEpoch > M5_SIGNAL_MAX_AGE_BARS * M5_GRANULARITY) {
    return reject('The M5 signal is too old.');
  }

  const candles = state.candles.slice(-M5_LOOKBACK);
  if (candles.length < M5_LOOKBACK || state.stdDev == null || state.stdDev <= 0) {
    return reject('Not enough confirmed M5 candles to measure momentum.');
  }

  const sign = direction === 'BUY' ? 1 : -1;
  let alignedBodies = 0;
  let totalBody = 0;
  let totalRange = 0;
  let path = 0;
  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const body = candle.close - candle.open;
    if (sign * body > 0) alignedBodies += 1;
    totalBody += Math.abs(body);
    totalRange += Math.max(0, candle.high - candle.low);
    if (index > 0) path += Math.abs(candle.close - candles[index - 1].close);
  }

  const netMove = sign * (candles[candles.length - 1].close - candles[0].open);
  const efficiency = path > 0 ? Math.abs(candles[candles.length - 1].close - candles[0].open) / path : 0;
  const bodyRatio = totalRange > 0 ? totalBody / totalRange : 0;
  const normalizedMove = netMove / state.stdDev;
  const momentumScore = Math.round(
    Math.min(1, efficiency / 0.8) * 35
    + Math.min(1, bodyRatio / 0.7) * 30
    + Math.min(1, Math.max(0, normalizedMove) / 0.6) * 35,
  );

  if (alignedBodies < M5_MIN_DIRECTIONAL_CANDLES) {
    return { ...reject('M5 candle bodies are not consistently moving in the trade direction.'), momentumScore };
  }
  if (efficiency < M5_MIN_EFFICIENCY) {
    return { ...reject('M5 price movement is choppy, not clean momentum.'), momentumScore };
  }
  if (bodyRatio < M5_MIN_BODY_RATIO) {
    return { ...reject('M5 candles show too much hesitation or wick activity.'), momentumScore };
  }
  if (normalizedMove < M5_MIN_NORMALIZED_MOVE) {
    return { ...reject('M5 directional movement is too weak compared with its normal range.'), momentumScore };
  }

  const aiScore = getAiPatternScore(aiModel, M5_GRANULARITY, direction, signal.levels);
  if (aiScore == null) {
    return { approved: false, aiScore: null, momentumScore, reason: 'AI model is not trained enough yet; limit orders are held back.' };
  }
  if (aiScore < LIMIT_MIN_AI_SCORE) {
    return { approved: false, aiScore, momentumScore, reason: 'AI historical-pattern score is below the limit-order threshold.' };
  }

  return { approved: true, aiScore, momentumScore, reason: 'M5 momentum and AI confirmation passed.' };
}

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
 * Creates educational pending-order ideas from existing candle and signal data.
 * It never submits, modifies, or cancels a broker order.
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

    // Pending orders are suggested only when all seven active timeframe trends agree.
    if (readings.length !== TIMEFRAMES.length) continue;
    const direction = readings[0];
    if (direction == null || !readings.every((bias) => bias === direction)) continue;

    const primary = states[PRIMARY_GRANULARITY];
    const m5LimitGate = evaluateM5LimitGate(states[M5_GRANULARITY], direction, aiModel, nowEpoch);
    const triggerSignal = primary?.latestSignal;
    if (!primary || !triggerSignal || triggerSignal.direction !== direction || triggerSignal.outcome.closed) continue;
    if (nowEpoch - triggerSignal.signalEpoch > SIGNAL_MAX_AGE_BARS * PRIMARY_GRANULARITY) continue;
    if (primary.stdDev == null || primary.stdDev <= 0 || primary.currentSma == null) continue;

    const recentCandles = primary.candles.slice(-SWING_LOOKBACK);
    if (recentCandles.length < SWING_LOOKBACK) continue;
    const buffer = primary.stdDev * 0.1;
    const swingHigh = Math.max(...recentCandles.map((candle) => candle.high));
    const swingLow = Math.min(...recentCandles.map((candle) => candle.low));

    const candidates: Array<{ type: PendingOrderType; entry: number; reason: string }> = [];
    if (direction === 'BUY') {
      const breakoutEntry = Math.max(swingHigh, currentPrice) + buffer;
      if (breakoutEntry > currentPrice) {
        candidates.push({
          type: 'BUY STOP',
          entry: breakoutEntry,
          reason: 'The market is moving up across all seven timeframes. This order waits for price to break above the recent high.',
        });
      }
      if (primary.currentSma < currentPrice) {
        candidates.push({
          type: 'BUY LIMIT',
          entry: primary.currentSma,
          reason: 'The market is moving up. This order waits for price to pull back to its recent average.',
        });
      }
    } else {
      const breakoutEntry = Math.min(swingLow, currentPrice) - buffer;
      if (breakoutEntry < currentPrice && breakoutEntry > 0) {
        candidates.push({
          type: 'SELL STOP',
          entry: breakoutEntry,
          reason: 'The market is moving down across all seven timeframes. This order waits for price to break below the recent low.',
        });
      }
      if (primary.currentSma > currentPrice) {
        candidates.push({
          type: 'SELL LIMIT',
          entry: primary.currentSma,
          reason: 'The market is moving down. This order waits for price to pull back to its recent average.',
        });
      }
    }

    for (const candidate of candidates) {
      // The strict M5/AI gate applies to limit orders only; fresh M5 candle-close signals trigger both stop and limit order reassessment.
      if (candidate.type.endsWith('LIMIT') && !m5LimitGate.approved) continue;
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
        aiScore: candidate.type.endsWith('LIMIT')
          ? m5LimitGate.aiScore
          : getAiPatternScore(aiModel, PRIMARY_GRANULARITY, direction, scoreLevels),
        momentumScore: candidate.type.endsWith('LIMIT') ? m5LimitGate.momentumScore : null,
        reason: candidate.type.endsWith('LIMIT')
          ? `${candidate.reason} M5 momentum and AI confirmation passed.`
          : candidate.reason,
        timeframeAgreement: TIMEFRAMES.length,
        signalEpoch: triggerSignal.signalEpoch,
      });
    }
  }

  return ideas.sort((a, b) => (b.aiScore ?? -1) - (a.aiScore ?? -1));
}
