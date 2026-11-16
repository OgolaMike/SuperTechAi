import type { Candle } from "./deriv.ts";

export type MarketStructureSarSignal = {
  symbol: string;
  direction: "BUY" | "SELL";
  timeframe: "M15";
  signalEpoch: number;
  entry: number;
  stopLoss: number;
  trailingStop: number;
  atr: number;
  sar: number;
  previousSar: number;
  swingHighs: [number, number];
  swingLows: [number, number];
  structure: "HH_HL" | "LL_LH";
  strategyVersion: "market-structure-sar-v1";
  idempotencyKey: string;
};

type Pivot = { index: number; price: number };
const SAR_STEP = 0.02;
const SAR_MAX = 0.2;
const ATR_PERIOD = 14;
const PIVOT_SIDE = 2;

function trueRange(c: Candle, previousClose: number): number {
  const high = c.high ?? c.close;
  const low = c.low ?? c.close;
  return Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
}

function atr(candles: Candle[]): number | null {
  if (candles.length < ATR_PERIOD + 1) return null;
  const ranges = candles.slice(-ATR_PERIOD).map((c, i) => {
    const absoluteIndex = candles.length - ATR_PERIOD + i;
    const previousClose = absoluteIndex > 0 ? candles[absoluteIndex - 1].close : (c.open ?? c.close);
    return trueRange(c, previousClose);
  });
  const value = ranges.reduce((sum, item) => sum + item, 0) / ranges.length;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function findPivots(candles: Candle[], highSide: boolean): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = PIVOT_SIDE; i < candles.length - PIVOT_SIDE; i += 1) {
    const price = highSide ? (candles[i].high ?? candles[i].close) : (candles[i].low ?? candles[i].close);
    let isPivot = true;
    for (let offset = 1; offset <= PIVOT_SIDE; offset += 1) {
      const before = highSide ? (candles[i - offset].high ?? candles[i - offset].close) : (candles[i - offset].low ?? candles[i - offset].close);
      const after = highSide ? (candles[i + offset].high ?? candles[i + offset].close) : (candles[i + offset].low ?? candles[i + offset].close);
      if (highSide ? price <= before || price < after : price >= before || price > after) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) pivots.push({ index: i, price });
  }
  return pivots;
}

function calculateSar(candles: Candle[]): number[] {
  const result = new Array<number>(candles.length).fill(0);
  if (candles.length < 3) return result;
  const firstUp = (candles[1].high ?? candles[1].close) >= (candles[0].high ?? candles[0].close);
  let uptrend = firstUp;
  let extreme = uptrend
    ? Math.max(candles[0].high ?? candles[0].close, candles[1].high ?? candles[1].close)
    : Math.min(candles[0].low ?? candles[0].close, candles[1].low ?? candles[1].close);
  let sar = uptrend
    ? Math.min(candles[0].low ?? candles[0].close, candles[1].low ?? candles[1].close)
    : Math.max(candles[0].high ?? candles[0].close, candles[1].high ?? candles[1].close);
  let af = SAR_STEP;
  result[1] = sar;

  for (let i = 2; i < candles.length; i += 1) {
    const current = candles[i];
    const priorSar = sar;
    sar = priorSar + af * (extreme - priorSar);
    if (uptrend) {
      sar = Math.min(sar, candles[i - 1].low ?? candles[i - 1].close, candles[i - 2].low ?? candles[i - 2].close);
      if ((current.low ?? current.close) < sar) {
        uptrend = false;
        sar = extreme;
        extreme = current.low ?? current.close;
        af = SAR_STEP;
      } else if ((current.high ?? current.close) > extreme) {
        extreme = current.high ?? current.close;
        af = Math.min(SAR_MAX, af + SAR_STEP);
      }
    } else {
      sar = Math.max(sar, candles[i - 1].high ?? candles[i - 1].close, candles[i - 2].high ?? candles[i - 2].close);
      if ((current.high ?? current.close) > sar) {
        uptrend = true;
        sar = extreme;
        extreme = current.high ?? current.close;
        af = SAR_STEP;
      } else if ((current.low ?? current.close) < extreme) {
        extreme = current.low ?? current.close;
        af = Math.min(SAR_MAX, af + SAR_STEP);
      }
    }
    result[i] = sar;
  }
  return result;
}

/**
 * Closed M15 candle strategy: confirmed HH+HL or LL+LH structure,
 * a fresh Parabolic SAR side change, and ATR-based initial/trailing protection.
 * This creates an alert proposal only; it does not place broker orders.
 */
export function buildMarketStructureSarSignal(
  symbol: string,
  candles: Candle[],
  nowEpoch: number,
): MarketStructureSarSignal | null {
  const closed = candles
    .filter((c) => c.epoch + 900 <= nowEpoch)
    .sort((a, b) => a.epoch - b.epoch);
  if (closed.length < 80) return null;
  const latest = closed[closed.length - 1];
  if (nowEpoch - (latest.epoch + 900) > 1800) return null;

  const highs = findPivots(closed, true).slice(-2);
  const lows = findPivots(closed, false).slice(-2);
  if (highs.length !== 2 || lows.length !== 2) return null;

  const higherHigh = highs[1].price > highs[0].price;
  const higherLow = lows[1].price > lows[0].price;
  const lowerLow = lows[1].price < lows[0].price;
  const lowerHigh = highs[1].price < highs[0].price;
  const bullishStructure = higherHigh && higherLow;
  const bearishStructure = lowerLow && lowerHigh;
  if (!bullishStructure && !bearishStructure) return null;

  const sarValues = calculateSar(closed);
  const lastIndex = closed.length - 1;
  const previousClose = closed[lastIndex - 1].close;
  const currentClose = latest.close;
  const previousSar = sarValues[lastIndex - 1];
  const sar = sarValues[lastIndex];
  const bullishFlip = previousSar >= previousClose && sar < currentClose;
  const bearishFlip = previousSar <= previousClose && sar > currentClose;
  const direction = bullishStructure && bullishFlip ? "BUY"
    : bearishStructure && bearishFlip ? "SELL" : null;
  if (!direction) return null;

  const currentAtr = atr(closed);
  if (currentAtr === null) return null;
  const entry = currentClose;
  const initialRisk = currentAtr * 2;
  const stopLoss = direction === "BUY" ? entry - initialRisk : entry + initialRisk;
  // The active trail is conservative: it respects the SAR and remains at least 1.5 ATR from price.
  const trailingStop = direction === "BUY"
    ? Math.max(sar, currentClose - currentAtr * 1.5)
    : Math.min(sar, currentClose + currentAtr * 1.5);
  if (!(entry > 0 && stopLoss > 0 && trailingStop > 0)) return null;

  return {
    symbol, direction, timeframe: "M15", signalEpoch: latest.epoch,
    entry, stopLoss, trailingStop, atr: currentAtr, sar, previousSar,
    swingHighs: [highs[0].price, highs[1].price],
    swingLows: [lows[0].price, lows[1].price],
    structure: bullishStructure ? "HH_HL" : "LL_LH",
    strategyVersion: "market-structure-sar-v1",
    idempotencyKey: symbol + "|M15|" + latest.epoch + "|" + direction + "|MARKET_STRUCTURE_SAR_V1",
  };
}
