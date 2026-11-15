import { buildMarketStructureSarSignal } from "./marketStructureSar.ts";
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
