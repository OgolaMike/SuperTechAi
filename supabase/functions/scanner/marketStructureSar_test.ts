import {
  buildMarketStructureSarSignal,
  calculateParabolicSar,
  findConfirmedPivots,
} from "./marketStructureSar.ts";
import type { Candle } from "./deriv.ts";

function candles(count: number, startEpoch = 1_800_000_000): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + Math.sin(index / 4) * 2 + index * 0.03;
    return {
      epoch: startEpoch + index * 900,
      open: close - 0.2,
      high: close + 0.8,
      low: close - 0.8,
      close,
    };
  });
}

Deno.test("Market Structure SAR waits for sufficient confirmed candles", () => {
  const data = candles(40);
  const now = data[data.length - 1].epoch + 900;
  if (buildMarketStructureSarSignal("TEST", data, now) !== null) {
    throw new Error("Expected no signal with insufficient history");
  }
});

Deno.test("Market Structure SAR ignores stale M15 data", () => {
  const data = candles(100);
  const now = data[data.length - 1].epoch + 900 + 1801;
  if (buildMarketStructureSarSignal("TEST", data, now) !== null) {
    throw new Error("Expected stale candle data to be ignored");
  }
});

Deno.test("Parabolic SAR returns a finite value for every candle after warm-up", () => {
  const data = candles(100);
  const values = calculateParabolicSar(data);
  if (!Number.isNaN(values[0]) || !Number.isFinite(values[1])) {
    throw new Error("Expected SAR warm-up then a finite starting value");
  }
  if (values.slice(1).some((value) => !Number.isFinite(value))) {
    throw new Error("Expected every calculated SAR value to be finite");
  }
});

Deno.test("Swing pivots are not confirmed until two candles form on the right", () => {
  const data: Candle[] = [
    { epoch: 1, open: 10, high: 11, low: 9, close: 10 },
    { epoch: 2, open: 10, high: 12, low: 9, close: 11 },
    { epoch: 3, open: 11, high: 15, low: 10, close: 12 },
    { epoch: 4, open: 12, high: 13, low: 10, close: 11 },
    { epoch: 5, open: 11, high: 12, low: 9, close: 10 },
  ];
  const confirmed = findConfirmedPivots(data, true);
  if (confirmed.length !== 1 || confirmed[0].index !== 2 || confirmed[0].price !== 15) {
    throw new Error("Expected the central high to confirm after two right-side candles");
  }
  if (findConfirmedPivots(data.slice(0, 4), true).length !== 0) {
    throw new Error("Expected no confirmed pivot with fewer than two right-side candles");
  }
});
