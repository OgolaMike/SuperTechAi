import type { Asset, TfState } from './sma';
import type { Candle } from './deriv';

export type BreakRetestSetup = {
  key: string;
  symbol: string;
  assetName: string;
  exchange: string;
  timeframe: string;
  granularity: number;
  direction: 'BUY' | 'SELL';
  zoneLow: number;
  zoneHigh: number;
  entry: number;
  stopLoss: number;
  target: number;
  riskReward: 5;
  breakEpoch: number;
  retestEpoch: number;
  confirmationEpoch: number;
  confirmationPrice: number;
  status: 'CONFIRMED';
};

function pivots(candles: Candle[], side: 'high' | 'low', start: number, end: number) {
  const result: Array<{ index: number; price: number }> = [];
  for (let i = Math.max(2, start); i < Math.min(candles.length - 2, end); i++) {
    const value = candles[i][side];
    const left = candles.slice(i - 2, i);
    const right = candles.slice(i + 1, i + 3);
    if (side === 'high'
      ? left.every(c => value >= c.high) && right.every(c => value > c.high)
      : left.every(c => value <= c.low) && right.every(c => value < c.low)) {
      result.push({ index: i, price: value });
    }
  }
  return result;
}

function findSetup(candles: Candle[], direction: 'BUY' | 'SELL', granularity: number) {
  // A setup is confirmed only from fully closed candles. The currently forming
  // live candle remains visible on the chart but cannot trigger an early entry.
  const now = Math.floor(Date.now() / 1000);
  const closedCandles = candles.filter(c => c.epoch + granularity <= now);
  if (closedCandles.length < 35) return null;
  candles = closedCandles;
  const from = Math.max(2, candles.length - 100);
  const side = direction === 'BUY' ? 'high' : 'low';
  const levels = pivots(candles, side, from, candles.length - 3);
  const atrWindow = candles.slice(-20);
  const avgRange = atrWindow.reduce((sum, c) => sum + c.high - c.low, 0) / atrWindow.length;
  const tolerance = Math.max(avgRange * 0.18, candles[candles.length - 1].close * 0.00015);
  for (let p = levels.length - 1; p >= 0; p--) {
    const level = levels[p];
    const breakIndex = candles.findIndex((c, i) => i > level.index && (direction === 'BUY' ? c.close > level.price + tolerance * 0.15 : c.close < level.price - tolerance * 0.15));
    if (breakIndex < 0 || breakIndex >= candles.length - 5) continue;
    let retestIndex = -1;
    let rejectionIndex = -1;
    for (let i = breakIndex + 1; i < candles.length - 2; i++) {
      const c = candles[i];
      // The breakout and retest must overlap this exact same marked zone.
      const zoneLow = level.price - tolerance;
      const zoneHigh = level.price + tolerance;
      const touched = c.low <= zoneHigh && c.high >= zoneLow;
      if (!touched) continue;
      const rejected = direction === 'BUY'
        ? c.close > level.price && c.close > c.open
        : c.close < level.price && c.close < c.open;
      if (rejected) { retestIndex = i; rejectionIndex = i; break; }
    }
    if (retestIndex < 0 || rejectionIndex >= candles.length - 1) continue;
    const rejection = candles[rejectionIndex];
    // Require the confirmation candle to CLOSE beyond the rejection candle,
    // not merely wick through it. No extra pivot / second higher-high filter.
    const confirmationIndex = candles.findIndex((c, i) => i > rejectionIndex
      && (direction === 'BUY' ? c.close > rejection.high : c.close < rejection.low));
    if (confirmationIndex < 0 || confirmationIndex < candles.length - 2) continue;
    const confirmation = candles[confirmationIndex];
    // Place the suggested entry below the BUY candle / above the SELL candle.
    const entry = direction === 'BUY' ? confirmation.low : confirmation.high;
    const targets = pivots(candles, direction === 'BUY' ? 'high' : 'low', Math.max(2, confirmationIndex - 100), confirmationIndex)
      .filter(pv => direction === 'BUY' ? pv.price > entry : pv.price < entry)
      .sort((a, b) => direction === 'BUY' ? a.price - b.price : b.price - a.price);
    const zoneLow = level.price - tolerance;
    const zoneHigh = level.price + tolerance;
    // Place the stop beyond the complete retest zone, with a volatility-aware safety buffer.
    const stopBuffer = Math.max(tolerance * 0.25, avgRange * 0.05);
    const stopLoss = direction === 'BUY' ? zoneLow - stopBuffer : zoneHigh + stopBuffer;
    const risk = Math.abs(entry - stopLoss);
    // Reject any setup where a deep confirmation wick would put entry beyond its stop.
    if (!Number.isFinite(risk) || risk <= 0
      || (direction === 'BUY' && entry <= stopLoss)
      || (direction === 'SELL' && entry >= stopLoss)) continue;
    // Fixed 5R target is calculated only after the structural stop has been established.
    const target = direction === 'BUY' ? entry + risk * 5 : entry - risk * 5;
    return {
      direction, zoneLow, zoneHigh, entry, stopLoss, target, riskReward: 5, breakEpoch: candles[breakIndex].epoch,
      retestEpoch: candles[retestIndex].epoch,
      confirmationEpoch: candles[confirmationIndex].epoch,
      confirmationPrice: direction === 'BUY' ? confirmation.low : confirmation.high,
    };
  }
  return null;
}

export function buildBreakRetestSetups(
  assets: Asset[],
  states: Record<string, Record<number, TfState>>,
): BreakRetestSetup[] {
  const bySymbol = new Map(assets.map(asset => [asset.symbol, asset]));
  const setups: BreakRetestSetup[] = [];
  for (const [symbol, byTimeframe] of Object.entries(states)) {
    const asset = bySymbol.get(symbol);
    if (!asset) continue;
    for (const state of Object.values(byTimeframe)) {
      const candles = state.candles;
      for (const direction of ['BUY', 'SELL'] as const) {
        const setup = findSetup(candles, direction, state.granularity);
        if (!setup) continue;
        setups.push({
          key: `${symbol}|${state.granularity}|${setup.direction}|${setup.confirmationEpoch}`,
          symbol, assetName: asset.name, exchange: asset.exchange ?? 'DERIV',
          timeframe: state.label, granularity: state.granularity,
          ...setup, status: 'CONFIRMED',
        });
      }
    }
  }
  return setups.sort((a, b) => b.confirmationEpoch - a.confirmationEpoch);
}
