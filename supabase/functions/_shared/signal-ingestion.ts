export type SignalDirection = "BUY" | "SELL";

export interface SignalIngestionPayload {
  signal_key: string;
  symbol: string;
  direction: SignalDirection;
  strategy_version: string;
  signal_epoch: number;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  h4_candle_closed: boolean;
  m15_confirmation_closed: boolean;
  m15_confirmed: boolean;
  evidence?: Record<string, unknown>;
  explanation?: string;
}

export type SignalValidation =
  | { ok: true; status: "confirmed" | "observed"; payload: SignalIngestionPayload }
  | { ok: false; error: string };

export function validateSignalIngestion(
  input: unknown,
  nowEpoch = Math.floor(Date.now() / 1000),
): SignalValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "json_object_required" };
  }
  const p = input as Record<string, unknown>;
  const signal_key = typeof p.signal_key === "string" ? p.signal_key.trim() : "";
  const symbol = typeof p.symbol === "string" ? p.symbol.trim().toUpperCase() : "";
  const direction = typeof p.direction === "string" ? p.direction.toUpperCase() : "";
  const strategy_version = typeof p.strategy_version === "string" ? p.strategy_version.trim() : "";
  const signal_epoch = p.signal_epoch;
  const entry_price = p.entry_price;
  const stop_loss = p.stop_loss;
  const take_profit = p.take_profit;

  if (!/^[A-Za-z0-9:_-]{8,160}$/.test(signal_key)) return { ok: false, error: "invalid_signal_key" };
  if (!/^[A-Z0-9._-]{2,40}$/.test(symbol)) return { ok: false, error: "invalid_symbol" };
  if (direction !== "BUY" && direction !== "SELL") return { ok: false, error: "invalid_direction" };
  if (!strategy_version || strategy_version.length > 80) return { ok: false, error: "invalid_strategy_version" };
  if (!Number.isSafeInteger(signal_epoch) || Number(signal_epoch) > nowEpoch ||
      nowEpoch - Number(signal_epoch) > 4 * 60 * 60) {
    return { ok: false, error: "signal_stale_or_future_dated" };
  }
  const prices = [entry_price, stop_loss, take_profit];
  if (!prices.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)) {
    return { ok: false, error: "invalid_signal_prices" };
  }
  if (direction === "BUY" && !(Number(stop_loss) < Number(entry_price) && Number(take_profit) > Number(entry_price))) {
    return { ok: false, error: "invalid_buy_price_geometry" };
  }
  if (direction === "SELL" && !(Number(stop_loss) > Number(entry_price) && Number(take_profit) < Number(entry_price))) {
    return { ok: false, error: "invalid_sell_price_geometry" };
  }
  if (typeof p.h4_candle_closed !== "boolean" ||
      typeof p.m15_confirmation_closed !== "boolean" ||
      typeof p.m15_confirmed !== "boolean") {
    return { ok: false, error: "closed_candle_confirmation_flags_required" };
  }
  const evidence = p.evidence === undefined ? {} : p.evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { ok: false, error: "evidence_must_be_object" };
  }
  if (JSON.stringify(evidence).length > 8000) return { ok: false, error: "evidence_too_large" };
  const explanation = p.explanation === undefined ? undefined : p.explanation;
  if (explanation !== undefined && (typeof explanation !== "string" || explanation.length > 1000)) {
    return { ok: false, error: "invalid_explanation" };
  }

  const payload: SignalIngestionPayload = {
    signal_key, symbol, direction, strategy_version, signal_epoch: Number(signal_epoch),
    entry_price: Number(entry_price), stop_loss: Number(stop_loss), take_profit: Number(take_profit),
    h4_candle_closed: p.h4_candle_closed,
    m15_confirmation_closed: p.m15_confirmation_closed,
    m15_confirmed: p.m15_confirmed,
    evidence: evidence as Record<string, unknown>,
    ...(explanation === undefined ? {} : { explanation: explanation as string }),
  };
  const confirmed = payload.h4_candle_closed && payload.m15_confirmation_closed && payload.m15_confirmed;
  return { ok: true, status: confirmed ? "confirmed" : "observed", payload };
}
