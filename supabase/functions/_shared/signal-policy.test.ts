import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateSignalForMember } from "./signal-policy.ts";

const now = 1_800_000_000;
const signal = {
  status: "confirmed" as const, symbol: "EURUSD", direction: "BUY" as const,
  primary_timeframe: "H4", confirmation_timeframe: "M15",
  h4_candle_closed: true, m15_confirmation_closed: true,
  signal_epoch: now - 60, strategy_version: "h4-m15-v1",
  entry_price: 1.1, stop_loss: 1.09, take_profit: 1.12,
};
const member = {
  paired: true, bridge_status: "connected", worker_status: "online",
  worker_last_seen_epoch: now - 2, place_new_orders: true,
  risk_controls_enabled: true, live_execution_enabled: true,
  emergency_stop: false, symbol_allowed: true,
  daily_baseline_epoch: now - 2, daily_history_complete: true,
  daily_loss_pct: 0.2, max_daily_loss_pct: 2,
  max_risk_per_trade_pct: 1, max_open_positions: 3,
  open_positions: 1, max_spread_points: 25, max_slippage_points: 10,
};

Deno.test("allows only a fresh confirmed H4 signal with M15 close and complete member gates", () => {
  assertEquals(evaluateSignalForMember(signal, member, now).allowed, true);
});
Deno.test("blocks an observed or unconfirmed signal", () => {
  assertEquals(evaluateSignalForMember({ ...signal, status: "observed" }, member, now).reason, "signal_not_confirmed");
});
Deno.test("blocks missing closed-candle confirmation", () => {
  assertEquals(evaluateSignalForMember({ ...signal, m15_confirmation_closed: false }, member, now).reason, "closed_candle_confirmation_required");
});
Deno.test("blocks a stale signal", () => {
  assertEquals(evaluateSignalForMember({ ...signal, signal_epoch: now - 14401 }, member, now).reason, "signal_stale_or_future_dated");
});
Deno.test("blocks invalid BUY stop/target geometry", () => {
  assertEquals(evaluateSignalForMember({ ...signal, stop_loss: 1.11 }, member, now).reason, "invalid_buy_price_geometry");
});
Deno.test("blocks stale worker heartbeat", () => {
  assertEquals(evaluateSignalForMember(signal, { ...member, worker_last_seen_epoch: now - 31 }, now).reason, "worker_disconnected_or_stale");
});
Deno.test("blocks emergency stop", () => {
  assertEquals(evaluateSignalForMember(signal, { ...member, emergency_stop: true }, now).reason, "emergency_stop_active");
});
Deno.test("blocks disabled live execution", () => {
  assertEquals(evaluateSignalForMember(signal, { ...member, live_execution_enabled: false }, now).reason, "live_execution_not_enabled");
});
Deno.test("blocks missing or stale daily baseline", () => {
  assertEquals(evaluateSignalForMember(signal, { ...member, daily_baseline_epoch: now - 31 }, now).reason, "daily_risk_baseline_missing_or_stale");
});
Deno.test("blocks a reached daily loss limit", () => {
  assertEquals(evaluateSignalForMember(signal, { ...member, daily_loss_pct: 2 }, now).reason, "daily_loss_limit_reached_or_invalid");
});
Deno.test("blocks a symbol not allowed for this member", () => {
  assertEquals(evaluateSignalForMember(signal, { ...member, symbol_allowed: false }, now).reason, "symbol_not_allowed_for_member");
});
Deno.test("blocks duplicate-risk configuration with zero spread cap", () => {
  assertEquals(evaluateSignalForMember(signal, { ...member, max_spread_points: 0 }, now).reason, "spread_or_slippage_limit_missing");
});
