import { backtestMarketStructureSar } from "./marketStructureSar_backtest.ts";
import type { Candle } from "./deriv.ts";

function sampleCandles(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + Math.sin(index / 4) * 2 + index * 0.03;
    return {
      epoch: 1_800_000_000 + index * 900,
      open: close - 0.2,
      high: close + 0.8,
      low: close - 0.8,
      close,
    };
  });
}

Deno.test("Backtest returns neutral metrics when no qualifying strategy signal exists", () => {
  const report = backtestMarketStructureSar("TEST", sampleCandles(120), { targetR: 1 });
  if (report.tradeCount !== 0 || report.winRate !== null || report.netR !== 0) {
    throw new Error("Expected no fabricated trades or performance metrics");
  }
});

Deno.test("Backtest rejects invalid target and transaction-cost assumptions", () => {
  const data = sampleCandles(100);
  let targetRejected = false;
  let costRejected = false;
  try {
    backtestMarketStructureSar("TEST", data, { targetR: 0 });
  } catch {
    targetRejected = true;
  }
  try {
    backtestMarketStructureSar("TEST", data, { targetR: 1, roundTripCost: -1 });
  } catch {
    costRejected = true;
  }
  if (!targetRejected || !costRejected) {
    throw new Error("Expected invalid assumptions to be rejected");
  }
});
