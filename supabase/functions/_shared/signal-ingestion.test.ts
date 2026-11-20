import { validateSignalIngestion } from "./signal-ingestion.ts";

const base = {
  signal_key: "EURUSD:H4:1795176000:v1",
  symbol: "EURUSD",
  direction: "BUY",
  strategy_version: "h4-m15-v1",
  signal_epoch: 1795176000,
  entry_price: 1.1,
  stop_loss: 1.09,
  take_profit: 1.12,
  h4_candle_closed: true,
  m15_confirmation_closed: true,
  m15_confirmed: true,
};

Deno.test("accepts a fresh closed H4 signal with M15 confirmation", () => {
  const result = validateSignalIngestion(base, 1795177000);
  if (!result.ok) throw new Error(result.error);
  if (result.status !== "confirmed") throw new Error("expected confirmed status");
});

Deno.test("stores unconfirmed signals as observed, not confirmed", () => {
  const result = validateSignalIngestion({ ...base, m15_confirmed: false }, 1795177000);
  if (!result.ok) throw new Error(result.error);
  if (result.status !== "observed") throw new Error("expected observed status");
});

Deno.test("rejects stale and future signals", () => {
  if (validateSignalIngestion(base, 1795191001).ok) throw new Error("stale signal accepted");
  if (validateSignalIngestion({ ...base, signal_epoch: 1795178000 }, 1795177000).ok) {
    throw new Error("future signal accepted");
  }
});

Deno.test("rejects invalid price geometry", () => {
  const result = validateSignalIngestion({ ...base, stop_loss: 1.11 }, 1795177000);
  if (result.ok || result.error !== "invalid_buy_price_geometry") throw new Error("bad geometry accepted");
});

Deno.test("requires explicit closed-candle flags and bounded evidence", () => {
  if (validateSignalIngestion({ ...base, h4_candle_closed: undefined }, 1795177000).ok) {
    throw new Error("missing candle flag accepted");
  }
  if (validateSignalIngestion({ ...base, evidence: { payload: "x".repeat(9000) } }, 1795177000).ok) {
    throw new Error("oversized evidence accepted");
  }
});
