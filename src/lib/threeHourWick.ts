import type { Candle } from './deriv';

export type WickDirection = 'BUY' | 'SELL';
export type ThreeHourWickCandidate = {
  symbol: string;
  direction: WickDirection;
  signalEpoch: number;
  entry: number;
  initialStopLoss: number;
  middleBand: number;
  upperBand: number;
  lowerBand: number;
  body: number;
  rejectionWick: number;
  wickToBodyRatio: number;
  idempotencyKey: string;
};

export type ThreeHourWickEvaluation =
  | { status: 'WAITING_FOR_DATA' | 'NO_REJECTION' | 'STALE_H4_CANDLE' }
  | { status: 'CONFIRMED'; candidate: ThreeHourWickCandidate };

export const THREE_HOUR_WICK_CONFIG = {
  timeframeSeconds: 4 * 60 * 60,
  bollingerPeriod: 20,
  bollingerDeviation: 2,
  wickToBodyMinimum: 2,
  stopBufferDeviationFraction: 0.1,
  maxSignalAgeCandles: 8,
  forcedExitAfterSeconds: 3 * 60 * 60,
  trailingActivationPercent: 0.7,
  trailingStepPercent: 0.5,
} as const;

function bands(candles: Candle[]) {
  const closes = candles.slice(-THREE_HOUR_WICK_CONFIG.bollingerPeriod).map((candle) => candle.close);
  if (closes.length !== THREE_HOUR_WICK_CONFIG.bollingerPeriod) return null;
  const mean = closes.reduce((sum, value) => sum + value, 0) / closes.length;
  const variance = closes.reduce((sum, value) => sum + (value - mean) ** 2, 0) / closes.length;
  const deviation = Math.sqrt(variance);
  if (!Number.isFinite(deviation) || deviation <= 0) return null;
  return {
    mean,
    deviation,
    upper: mean + THREE_HOUR_WICK_CONFIG.bollingerDeviation * deviation,
    lower: mean - THREE_HOUR_WICK_CONFIG.bollingerDeviation * deviation,
  };
}

/** Evaluate only the most recent fully closed H4 candle; never use a forming candle. */
export function evaluateThreeHourWick(
  symbol: string,
  candles: Candle[],
  nowEpoch: number,
): ThreeHourWickEvaluation {
  const closed = [...candles]
    .filter((candle) => candle.epoch + THREE_HOUR_WICK_CONFIG.timeframeSeconds <= nowEpoch)
    .sort((a, b) => a.epoch - b.epoch);
  if (closed.length < THREE_HOUR_WICK_CONFIG.bollingerPeriod) return { status: 'WAITING_FOR_DATA' };

  const candle = closed[closed.length - 1];
  if (nowEpoch - (candle.epoch + THREE_HOUR_WICK_CONFIG.timeframeSeconds) >
      THREE_HOUR_WICK_CONFIG.maxSignalAgeCandles * THREE_HOUR_WICK_CONFIG.timeframeSeconds) {
    return { status: 'STALE_H4_CANDLE' };
  }
  const stats = bands(closed.slice(0, -1).concat(candle));
  if (!stats) return { status: 'WAITING_FOR_DATA' };

  const body = Math.abs(candle.close - candle.open);
  const range = candle.high - candle.low;
  if (!(range > 0)) return { status: 'NO_REJECTION' };
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const safeBody = Math.max(body, range * 0.01);
  const buy = lowerWick >= safeBody * THREE_HOUR_WICK_CONFIG.wickToBodyMinimum && candle.close > candle.open;
  const sell = upperWick >= safeBody * THREE_HOUR_WICK_CONFIG.wickToBodyMinimum && candle.close < candle.open;
  if (buy === sell) return { status: 'NO_REJECTION' };
  const direction: WickDirection = buy ? 'BUY' : 'SELL';

  const entry = candle.close;
  const buffer = stats.deviation * THREE_HOUR_WICK_CONFIG.stopBufferDeviationFraction;
  const initialStopLoss = direction === 'BUY' ? stats.lower - buffer : stats.upper + buffer;
  if (!(entry > 0 && initialStopLoss > 0) ||
      (direction === 'BUY' ? initialStopLoss >= entry : initialStopLoss <= entry)) {
    return { status: 'NO_REJECTION' };
  }

  return {
    status: 'CONFIRMED',
    candidate: {
      symbol, direction, signalEpoch: candle.epoch, entry, initialStopLoss,
      middleBand: stats.mean, upperBand: stats.upper, lowerBand: stats.lower,
      body, rejectionWick: buy ? lowerWick : upperWick,
      wickToBodyRatio: (buy ? lowerWick : upperWick) / safeBody,
      idempotencyKey: `${symbol}|H4|${candle.epoch}|${direction}|3H_WICK_V1`,
    },
  };
}

/** Price-move trailing plan. Caller must persist entry and only tighten broker stops. */
export function calculateThreeHourWickTrailingStop(
  direction: WickDirection,
  entry: number,
  currentPrice: number,
  currentStop: number,
): number {
  if (!(entry > 0 && currentPrice > 0)) return currentStop;
  const favourablePercent = direction === 'BUY'
    ? ((currentPrice - entry) / entry) * 100
    : ((entry - currentPrice) / entry) * 100;
  if (favourablePercent < THREE_HOUR_WICK_CONFIG.trailingActivationPercent) return currentStop;

  const steps = Math.floor(
    (favourablePercent - THREE_HOUR_WICK_CONFIG.trailingActivationPercent) /
    THREE_HOUR_WICK_CONFIG.trailingStepPercent,
  );
  const lockedPercent = steps * THREE_HOUR_WICK_CONFIG.trailingStepPercent;
  const proposed = direction === 'BUY'
    ? entry * (1 + lockedPercent / 100)
    : entry * (1 - lockedPercent / 100);
  return direction === 'BUY' ? Math.max(currentStop, proposed) : Math.min(currentStop, proposed);
}

/** A position is due for forced exit based on actual broker execution time. */
export function isThreeHourWickPositionDue(executedAtEpoch: number, nowEpoch: number): boolean {
  return Number.isFinite(executedAtEpoch) &&
    nowEpoch >= executedAtEpoch + THREE_HOUR_WICK_CONFIG.forcedExitAfterSeconds;
}
