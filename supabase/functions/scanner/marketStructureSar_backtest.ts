import type { Candle } from "./deriv.ts";
import { buildMarketStructureSarSignal } from "./marketStructureSar.ts";

export type BacktestOptions = {
  /** Profit target in multiples of initial risk. Run separate tests for 1, 1.5 and 2. */
  targetR: number;
  /** Estimated round-trip spread + commission expressed as an absolute price amount per unit. */
  roundTripCost?: number;
};

export type BacktestTrade = {
  direction: "BUY" | "SELL";
  signalEpoch: number;
  entryEpoch: number;
  exitEpoch: number | null;
  entry: number;
  stopLoss: number;
  target: number;
  exitPrice: number | null;
  exitReason: "STOP" | "TARGET" | "END_OF_DATA";
  rMultiple: number | null;
};

export type BacktestReport = {
  symbol: string;
  timeframe: "M15";
  strategyVersion: "market-structure-sar-v1";
  targetR: number;
  roundTripCost: number;
  periodStart: number | null;
  periodEnd: number | null;
  trades: BacktestTrade[];
  tradeCount: number;
  wins: number;
  losses: number;
  openAtEnd: number;
  winRate: number | null;
  averageR: number | null;
  netR: number;
  maxDrawdownR: number;
};

/**
 * Exploratory OHLC backtest. Signals are evaluated only after a candle closes;
 * entry is the next candle's open. A stop is checked before a target when both
 * are touched in one candle, avoiding optimistic intrabar assumptions.
 *
 * The engine does not simulate the SAR/ATR trailing reference as an active
 * stop: production strategy currently exposes that reference for information
 * only. Each trade uses the original 2xATR stop and a test-only targetR.
 */
export function backtestMarketStructureSar(
  symbol: string,
  input: Candle[],
  options: BacktestOptions,
): BacktestReport {
  if (!Number.isFinite(options.targetR) || options.targetR <= 0) {
    throw new Error("targetR must be a positive number");
  }
  const roundTripCost = options.roundTripCost ?? 0;
  if (!Number.isFinite(roundTripCost) || roundTripCost < 0) {
    throw new Error("roundTripCost must be zero or a positive price amount");
  }

  const candles = input
    .filter((c) => Number.isFinite(c.epoch) && Number.isFinite(c.open) &&
      Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close))
    .slice()
    .sort((a, b) => a.epoch - b.epoch);

  const trades: BacktestTrade[] = [];
  let index = 79;
  while (index < candles.length - 1) {
    const signalCandle = candles[index];
    const signal = buildMarketStructureSarSignal(
      symbol,
      candles.slice(0, index + 1),
      signalCandle.epoch + 900,
    );
    if (!signal || signal.signalEpoch !== signalCandle.epoch) {
      index += 1;
      continue;
    }

    const entryCandle = candles[index + 1];
    const direction = signal.direction;
    const entry = entryCandle.open as number;
    const risk = direction === "BUY" ? entry - signal.stopLoss : signal.stopLoss - entry;
    if (!(risk > 0) || !Number.isFinite(risk)) {
      index += 1;
      continue;
    }
    const target = direction === "BUY"
      ? entry + risk * options.targetR
      : entry - risk * options.targetR;

    let closedTrade: BacktestTrade | null = null;
    for (let exitIndex = index + 1; exitIndex < candles.length; exitIndex += 1) {
      const candle = candles[exitIndex];
      const stopHit = direction === "BUY"
        ? candle.low! <= signal.stopLoss
        : candle.high! >= signal.stopLoss;
      const targetHit = direction === "BUY"
        ? candle.high! >= target
        : candle.low! <= target;

      // Conservative tie-break: if both levels are touched in one OHLC bar,
      // assume the stop was reached first.
      if (stopHit) {
        const fill = direction === "BUY"
          ? Math.min(signal.stopLoss, candle.open as number)
          : Math.max(signal.stopLoss, candle.open as number);
        const gross = direction === "BUY" ? fill - entry : entry - fill;
        closedTrade = {
          direction, signalEpoch: signal.signalEpoch, entryEpoch: entryCandle.epoch,
          exitEpoch: candle.epoch, entry, stopLoss: signal.stopLoss, target,
          exitPrice: fill, exitReason: "STOP",
          rMultiple: (gross - roundTripCost) / risk,
        };
        index = exitIndex + 1;
        break;
      }
      if (targetHit) {
        const gross = direction === "BUY" ? target - entry : entry - target;
        closedTrade = {
          direction, signalEpoch: signal.signalEpoch, entryEpoch: entryCandle.epoch,
          exitEpoch: candle.epoch, entry, stopLoss: signal.stopLoss, target,
          exitPrice: target, exitReason: "TARGET",
          rMultiple: (gross - roundTripCost) / risk,
        };
        index = exitIndex + 1;
        break;
      }
      if (exitIndex === candles.length - 1) {
        closedTrade = {
          direction, signalEpoch: signal.signalEpoch, entryEpoch: entryCandle.epoch,
          exitEpoch: null, entry, stopLoss: signal.stopLoss, target,
          exitPrice: null, exitReason: "END_OF_DATA", rMultiple: null,
        };
        index = candles.length;
      }
    }
    if (closedTrade) trades.push(closedTrade);
    else index += 1;
  }

  const completed = trades.filter((trade) => trade.rMultiple !== null);
  const wins = completed.filter((trade) => (trade.rMultiple as number) > 0).length;
  const losses = completed.filter((trade) => (trade.rMultiple as number) < 0).length;
  const netR = completed.reduce((sum, trade) => sum + (trade.rMultiple as number), 0);
  let equity = 0;
  let peak = 0;
  let maxDrawdownR = 0;
  for (const trade of completed) {
    equity += trade.rMultiple as number;
    peak = Math.max(peak, equity);
    maxDrawdownR = Math.max(maxDrawdownR, peak - equity);
  }

  return {
    symbol,
    timeframe: "M15",
    strategyVersion: "market-structure-sar-v1",
    targetR: options.targetR,
    roundTripCost,
    periodStart: candles[0]?.epoch ?? null,
    periodEnd: candles[candles.length - 1]?.epoch ?? null,
    trades,
    tradeCount: completed.length,
    wins,
    losses,
    openAtEnd: trades.length - completed.length,
    winRate: completed.length ? wins / completed.length : null,
    averageR: completed.length ? netR / completed.length : null,
    netR,
    maxDrawdownR,
  };
}
