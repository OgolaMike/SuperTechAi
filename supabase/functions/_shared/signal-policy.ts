export type Direction = "BUY" | "SELL";

export interface CanonicalSignal {
  status: "observed" | "confirmed" | "invalidated" | "expired";
  symbol: string;
  direction: Direction;
  primary_timeframe: string;
  confirmation_timeframe: string;
  h4_candle_closed: boolean;
  m15_confirmation_closed: boolean;
  signal_epoch: number;
  strategy_version: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
}

export interface MemberExecutionSnapshot {
  paired: boolean;
  bridge_status: string;
  worker_status: string;
  worker_last_seen_epoch: number;
  place_new_orders: boolean;
  risk_controls_enabled: boolean;
  live_execution_enabled: boolean;
  emergency_stop: boolean;
  symbol_allowed: boolean;
  daily_baseline_epoch: number;
  daily_history_complete: boolean;
  daily_loss_pct: number;
  max_daily_loss_pct: number;
  max_risk_per_trade_pct: number;
  max_open_positions: number;
  open_positions: number;
  max_spread_points: number;
  max_slippage_points: number;
}

export type PolicyDecision =
  | { allowed: true; reason: "all_checks_passed"; evaluated_at: number }
  | { allowed: false; reason: string; evaluated_at: number };

const deny = (reason: string, evaluated_at: number): PolicyDecision => ({
  allowed: false, reason, evaluated_at,
});

export function evaluateSignalForMember(
  signal: CanonicalSignal,
  member: MemberExecutionSnapshot,
  nowEpoch = Math.floor(Date.now() / 1000),
): PolicyDecision {
  if (!Number.isSafeInteger(nowEpoch) || nowEpoch <= 0) return deny("invalid_evaluation_time", nowEpoch);
  if (!signal || signal.status !== "confirmed") return deny("signal_not_confirmed", nowEpoch);
  if (signal.primary_timeframe !== "H4" || signal.confirmation_timeframe !== "M15") {
    return deny("required_H4_M15_timeframes_missing", nowEpoch);
  }
  if (signal.h4_candle_closed !== true || signal.m15_confirmation_closed !== true) {
    return deny("closed_candle_confirmation_required", nowEpoch);
  }
  if (!signal.symbol?.trim() || signal.symbol.length > 40 || !signal.strategy_version?.trim()) {
    return deny("invalid_signal_identity", nowEpoch);
  }
  if (!Number.isSafeInteger(signal.signal_epoch) || signal.signal_epoch > nowEpoch ||
      nowEpoch - signal.signal_epoch > 4 * 60 * 60) {
    return deny("signal_stale_or_future_dated", nowEpoch);
  }
  const prices = [signal.entry_price, signal.stop_loss, signal.take_profit];
  if (!prices.every((n) => Number.isFinite(n) && n > 0)) return deny("invalid_signal_prices", nowEpoch);
  if (signal.direction === "BUY") {
    if (!(signal.stop_loss < signal.entry_price && signal.take_profit > signal.entry_price)) {
      return deny("invalid_buy_price_geometry", nowEpoch);
    }
  } else if (signal.direction === "SELL") {
    if (!(signal.stop_loss > signal.entry_price && signal.take_profit < signal.entry_price)) {
      return deny("invalid_sell_price_geometry", nowEpoch);
    }
  } else return deny("invalid_signal_direction", nowEpoch);

  if (!member?.paired) return deny("member_account_not_paired", nowEpoch);
  if (member.bridge_status !== "connected" || member.worker_status !== "online" ||
      !Number.isFinite(member.worker_last_seen_epoch) ||
      nowEpoch - member.worker_last_seen_epoch < 0 || nowEpoch - member.worker_last_seen_epoch > 30) {
    return deny("worker_disconnected_or_stale", nowEpoch);
  }
  if (member.emergency_stop !== false) return deny("emergency_stop_active", nowEpoch);
  if (member.live_execution_enabled !== true) return deny("live_execution_not_enabled", nowEpoch);
  if (member.place_new_orders !== true) return deny("new_order_permission_disabled", nowEpoch);
  if (member.risk_controls_enabled !== true) return deny("risk_controls_disabled", nowEpoch);
  if (member.symbol_allowed !== true) return deny("symbol_not_allowed_for_member", nowEpoch);

  if (!Number.isFinite(member.daily_baseline_epoch) ||
      nowEpoch - member.daily_baseline_epoch < 0 || nowEpoch - member.daily_baseline_epoch > 30 ||
      member.daily_history_complete !== true) {
    return deny("daily_risk_baseline_missing_or_stale", nowEpoch);
  }
  if (!Number.isFinite(member.max_risk_per_trade_pct) ||
      member.max_risk_per_trade_pct <= 0 || member.max_risk_per_trade_pct > 2) {
    return deny("risk_per_trade_outside_hard_limit", nowEpoch);
  }
  if (!Number.isFinite(member.max_daily_loss_pct) ||
      member.max_daily_loss_pct <= 0 || member.max_daily_loss_pct > 5 ||
      !Number.isFinite(member.daily_loss_pct) || member.daily_loss_pct < 0 ||
      member.daily_loss_pct >= member.max_daily_loss_pct) {
    return deny("daily_loss_limit_reached_or_invalid", nowEpoch);
  }
  if (!Number.isSafeInteger(member.max_open_positions) || member.max_open_positions < 1 ||
      member.max_open_positions > 20 || !Number.isSafeInteger(member.open_positions) ||
      member.open_positions < 0 || member.open_positions >= member.max_open_positions) {
    return deny("maximum_open_positions_reached_or_invalid", nowEpoch);
  }
  if (!Number.isFinite(member.max_spread_points) || member.max_spread_points <= 0 ||
      !Number.isFinite(member.max_slippage_points) || member.max_slippage_points <= 0) {
    return deny("spread_or_slippage_limit_missing", nowEpoch);
  }
  return { allowed: true, reason: "all_checks_passed", evaluated_at: nowEpoch };
}
