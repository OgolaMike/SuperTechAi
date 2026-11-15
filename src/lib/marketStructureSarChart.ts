import type { Candle } from './deriv';

export type SarDot = { epoch: number; value: number };
export type StructureMarker = { epoch: number; price: number; label: 'HH' | 'HL' | 'LL' | 'LH' };

const STEP = 0.02;
const MAX_STEP = 0.2;
const PIVOT_SIDE = 2;

/** Calculate Parabolic SAR using the same step and cap as the M15 signal engine. */
export function calculateMarketStructureSar(candles: Candle[]): SarDot[] {
  if (candles.length < 3) return [];
  const values = new Array<number>(candles.length).fill(Number.NaN);
  let rising = candles[1].high >= candles[0].high;
  let extreme = rising
    ? Math.max(candles[0].high, candles[1].high)
    : Math.min(candles[0].low, candles[1].low);
  let sar = rising
    ? Math.min(candles[0].low, candles[1].low)
    : Math.max(candles[0].high, candles[1].high);
  let acceleration = STEP;
  values[1] = sar;

  for (let i = 2; i < candles.length; i += 1) {
    const current = candles[i];
    sar += acceleration * (extreme - sar);
    if (rising) {
      sar = Math.min(sar, candles[i - 1].low, candles[i - 2].low);
      if (current.low < sar) {
        rising = false;
        sar = extreme;
        extreme = current.low;
        acceleration = STEP;
      } else if (current.high > extreme) {
        extreme = current.high;
        acceleration = Math.min(MAX_STEP, acceleration + STEP);
      }
    } else {
      sar = Math.max(sar, candles[i - 1].high, candles[i - 2].high);
      if (current.high > sar) {
        rising = true;
        sar = extreme;
        extreme = current.high;
        acceleration = STEP;
      } else if (current.low < extreme) {
        extreme = current.low;
        acceleration = Math.min(MAX_STEP, acceleration + STEP);
      }
    }
    values[i] = sar;
  }

  return candles.flatMap((candle, index) =>
    Number.isFinite(values[index]) ? [{ epoch: candle.epoch, value: values[index] }] : [],
  );
}

/** Label confirmed pivots only after two closed candles have formed to their right. */
export function findMarketStructureMarkers(candles: Candle[]): StructureMarker[] {
  const highs: Array<{ index: number; price: number }> = [];
  const lows: Array<{ index: number; price: number }> = [];
  for (let i = PIVOT_SIDE; i < candles.length - PIVOT_SIDE; i += 1) {
    const high = candles[i].high;
    const low = candles[i].low;
    let isHigh = true;
    let isLow = true;
    for (let offset = 1; offset <= PIVOT_SIDE; offset += 1) {
      if (high <= candles[i - offset].high || high < candles[i + offset].high) isHigh = false;
      if (low >= candles[i - offset].low || low > candles[i + offset].low) isLow = false;
    }
    if (isHigh) highs.push({ index: i, price: high });
    if (isLow) lows.push({ index: i, price: low });
  }

  const markers: StructureMarker[] = [];
  highs.forEach((pivot, index) => {
    if (index === 0) return;
    markers.push({
      epoch: candles[pivot.index].epoch,
      price: pivot.price,
      label: pivot.price > highs[index - 1].price ? 'HH' : 'LH',
    });
  });
  lows.forEach((pivot, index) => {
    if (index === 0) return;
    markers.push({
      epoch: candles[pivot.index].epoch,
      price: pivot.price,
      label: pivot.price > lows[index - 1].price ? 'HL' : 'LL',
    });
  });
  return markers.sort((a, b) => a.epoch - b.epoch);
}
