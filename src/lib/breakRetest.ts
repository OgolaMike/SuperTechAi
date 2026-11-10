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
  target: number;
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

function findSetup(candles: Candle[], direction: 'BUY' | 'SELL') {
  if (candles.length < 35) return null;
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
      const touched = direction === 'BUY'
        ? c.low <= level.price + tolerance && c.low >= level.price - tolerance * 2
        : c.high >= level.price - tolerance && c.high <= level.price + tolerance * 2;
      if (!touched) continue;
      const rejected = direction === 'BUY'
        ? c.close > level.price && c.close > c.open
        : c.close < level.price && c.close < c.open;
      if (rejected) { retestIndex = i; rejectionIndex = i; break; }
    }
    if (retestIndex < 0 || rejectionIndex >= candles.length - 1) continue;
    const rejection = candles[rejectionIndex];
    const confirmationIndex = candles.findIndex((c, i) => i > rejectionIndex && (direction === 'BUY' ? c.high > rejection.high : c.low < rejection.low));
    if (confirmationIndex < 0 || confirmationIndex < candles.length - 3) continue;
    const entry = candles[confirmationIndex].close;
    const targets = pivots(candles, direction === 'BUY' ? 'high' : 'low', Math.max(2, confirmationIndex - 100), confirmationIndex)
      .filter(pv => direction === 'BUY' ? pv.price > entry : pv.price < entry)
      .sort((a, b) => direction === 'BUY' ? a.price - b.price : b.price - a.price);
    const target = targets[0]?.price;
    if (target == null) continue;
    return {
      direction, zoneLow: level.price - tolerance, zoneHigh: level.price + tolerance,
      entry, target, breakEpoch: candles[breakIndex].epoch,
      retestEpoch: candles[retestIndex].epoch,
      confirmationEpoch: candles[confirmationIndex].epoch,
      confirmationPrice: direction === 'BUY' ? rejection.high : rejection.low,
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
        const setup = findSetup(candles, direction);
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
