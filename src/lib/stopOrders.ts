import { getAiPatternScore, type SignalLearningModel } from './aiLearning';
import { isStale, TIMEFRAMES, type Asset, type TfState } from './sma';
import type { Direction } from './signals';

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
  momentumScore: null;
  reason: string;
  timeframeAgreement: number;
  signalEpoch: number;
  strengthScore: number;
  entryHitEpoch: number | null;
  stopLossHitEpoch: number | null;
  takeProfitHitEpoch: number | null;
};

const M15 = 900;
const MAX_SIGNAL_AGE_BARS = 8;

function timeframeBias(state: TfState): Direction | null {
  if (state.lastClose == null || state.currentSma == null || state.stdDev == null) return null;
  const neutral = state.stdDev * 0.1;
  const difference = state.lastClose - state.currentSma;
  if (difference > neutral) return 'BUY';
  if (difference < -neutral) return 'SELL';
  return null;
}

function findLevelHits(
  direction: Direction,
  entry: number,
  stopLoss: number,
  takeProfit: number,
  candles: TfState['candles'],
  signalEpoch: number,
) {
  const afterSignal = candles.filter((candle) => candle.epoch > signalEpoch);
  let entryHitEpoch: number | null = null;
  let stopLossHitEpoch: number | null = null;
  let takeProfitHitEpoch: number | null = null;

  for (const candle of afterSignal) {
    const close = candle.close;
    const entered = direction === 'BUY' ? close >= entry : close <= entry;
    if (entryHitEpoch === null && entered) entryHitEpoch = candle.epoch;
    if (entryHitEpoch === null) continue;

    const stopped = direction === 'BUY' ? close <= stopLoss : close >= stopLoss;
    const targeted = direction === 'BUY' ? close >= takeProfit : close <= takeProfit;
    if (stopped) {
      stopLossHitEpoch = candle.epoch;
      break;
    }
    if (targeted) {
      takeProfitHitEpoch = candle.epoch;
      break;
    }
  }

  return { entryHitEpoch, stopLossHitEpoch, takeProfitHitEpoch };
}

/**
 * Builds M15 breakout stop-order proposals from the existing M15 signal levels.
 * Entry = TP1, stop-loss = original signal entry, target = TP3.
 * It only monitors confirmed M15 candle closes and never places broker orders.
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
    const states = statesBySymbol[asset.symbol];
    const currentPrice = prices[asset.symbol];
    const m15 = states?.[M15];
    const signal = m15?.latestSignal;
    if (!states || !m15 || currentPrice == null || !Number.isFinite(currentPrice) || !signal) continue;
    if (isStale(m15, nowEpoch) || nowEpoch - signal.signalEpoch > MAX_SIGNAL_AGE_BARS * M15) continue;

    const biases = TIMEFRAMES.map((timeframe) => {
      const state = states[timeframe.granularity];
      return !state || isStale(state, nowEpoch) ? null : timeframeBias(state);
    });
    if (biases.length !== TIMEFRAMES.length || !biases.every((bias) => bias === signal.direction)) continue;

    const { entry: originalEntry, tp1, tp3 } = signal.levels;
    if (!(tp1 > 0 && tp3 > 0 && originalEntry > 0)) continue;

    const hits = findLevelHits(
      signal.direction,
      tp1,
      originalEntry,
      tp3,
      m15.candles,
      signal.signalEpoch,
    );
    const type = signal.direction === 'BUY' ? 'BUY STOP' : 'SELL STOP';
    const aiScore = getAiPatternScore(aiModel, M15, signal.direction, signal.levels);

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
      momentumScore: null,
      reason: `M15 ${signal.direction} signal. The stop entry is placed at the signal's TP1 level, the original signal entry becomes the stop-loss, and TP3 remains the final target.`,
      timeframeAgreement: TIMEFRAMES.length,
      signalEpoch: signal.signalEpoch,
      strengthScore: aiScore ?? 0,
      ...hits,
    });
  }

  return ideas.sort((a, b) => (b.aiScore ?? -1) - (a.aiScore ?? -1));
}
