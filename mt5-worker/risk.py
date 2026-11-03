"""Fail-closed MT5 order preflight and account-currency risk sizing.

This module calculates and validates a proposed order. It deliberately does
not call order_send or modify broker state.
"""
from __future__ import annotations

import math
from typing import Any


class RiskRejected(ValueError):
    """Raised when a proposed order fails a configured safety check."""


def _positive_number(value: Any, label: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise RiskRejected(f"invalid_{label}") from None
    if not math.isfinite(number) or number <= 0:
        raise RiskRejected(f"invalid_{label}")
    return number


def calculate_risk_volume(
    mt5_api: Any,
    *,
    symbol: str,
    direction: str,
    entry: float,
    stop_loss: float,
    equity: float,
    risk_pct: float,
    volume_min: float,
    volume_max: float,
    volume_step: float,
) -> dict[str, float]:
    """Size volume using broker-calculated loss for one lot in account currency."""
    direction = direction.upper()
    if direction not in {"BUY", "SELL"}:
        raise RiskRejected("invalid_direction")
    entry = _positive_number(entry, "entry")
    stop_loss = _positive_number(stop_loss, "stop_loss")
    equity = _positive_number(equity, "equity")
    risk_pct = _positive_number(risk_pct, "risk_pct")
    volume_min = _positive_number(volume_min, "volume_min")
    volume_max = _positive_number(volume_max, "volume_max")
    volume_step = _positive_number(volume_step, "volume_step")
    if risk_pct > 2.0:
        raise RiskRejected("risk_per_trade_above_hard_limit")
    if direction == "BUY" and stop_loss >= entry:
        raise RiskRejected("buy_stop_loss_must_be_below_entry")
    if direction == "SELL" and stop_loss <= entry:
        raise RiskRejected("sell_stop_loss_must_be_above_entry")
    if volume_max < volume_min:
        raise RiskRejected("invalid_broker_volume_limits")

    order_type = mt5_api.ORDER_TYPE_BUY if direction == "BUY" else mt5_api.ORDER_TYPE_SELL
    one_lot_result = mt5_api.order_calc_profit(order_type, symbol, 1.0, entry, stop_loss)
    if one_lot_result is None:
        raise RiskRejected("broker_profit_calculation_failed")
    loss_per_lot = abs(float(one_lot_result))
    if not math.isfinite(loss_per_lot) or loss_per_lot <= 0:
        raise RiskRejected("stop_loss_has_no_calculable_risk")

    risk_amount = equity * risk_pct / 100.0
    raw_volume = risk_amount / loss_per_lot
    stepped_volume = math.floor((raw_volume + 1e-12) / volume_step) * volume_step
    volume = round(stepped_volume, 8)
    if volume < volume_min:
        raise RiskRejected("minimum_broker_lot_exceeds_risk_budget")
    volume = min(volume, volume_max)
    estimated_loss = loss_per_lot * volume
    if estimated_loss > risk_amount + max(0.01, risk_amount * 0.001):
        raise RiskRejected("rounded_volume_exceeds_risk_budget")
    return {
        "volume": volume,
        "risk_amount": risk_amount,
        "estimated_loss": estimated_loss,
        "loss_per_lot": loss_per_lot,
    }


def preflight_new_order(
    mt5_api: Any,
    *,
    settings: dict[str, Any],
    account: Any,
    symbol_info: Any,
    tick: Any,
    direction: str,
    entry: float,
    stop_loss: float,
    take_profit: float,
    daily_loss_pct: float,
    current_open_positions: int,
) -> dict[str, Any]:
    """Validate permissions, account guardrails, broker conditions and lot size."""
    if settings.get("risk_controls_enabled") is not True:
        raise RiskRejected("risk_controls_not_enabled")
    if settings.get("place_new_orders") is not True:
        raise RiskRejected("new_order_permission_not_granted")
    if not bool(getattr(account, "trade_allowed", False)) or not bool(getattr(account, "trade_expert", False)):
        raise RiskRejected("account_trading_not_allowed")
    if not bool(getattr(symbol_info, "visible", False)):
        raise RiskRejected("symbol_not_visible")
    if int(getattr(symbol_info, "trade_mode", 0)) == int(getattr(mt5_api, "SYMBOL_TRADE_MODE_DISABLED", 0)):
        raise RiskRejected("symbol_trading_disabled")

    direction = direction.upper()
    if direction not in {"BUY", "SELL"}:
        raise RiskRejected("invalid_direction")
    entry = _positive_number(entry, "entry")
    stop_loss = _positive_number(stop_loss, "stop_loss")
    take_profit = _positive_number(take_profit, "take_profit")
    equity = _positive_number(getattr(account, "equity", None), "equity")
    free_margin = _positive_number(getattr(account, "margin_free", None), "free_margin")

    risk_pct = _positive_number(settings.get("max_risk_per_trade_pct"), "risk_pct")
    daily_limit = _positive_number(settings.get("max_daily_loss_pct"), "daily_loss_limit")
    max_positions = int(settings.get("max_open_positions", 0))
    max_spread = int(settings.get("max_spread_points", 0))
    max_slippage = int(settings.get("max_slippage_points", 0))
    if risk_pct > 2.0 or daily_limit > 5.0 or not 1 <= max_positions <= 20:
        raise RiskRejected("risk_settings_outside_hard_limits")
    if max_spread <= 0 or max_slippage <= 0:
        raise RiskRejected("spread_and_slippage_limits_must_be_configured")
    if not math.isfinite(float(daily_loss_pct)) or daily_loss_pct < 0 or daily_loss_pct >= daily_limit:
        raise RiskRejected("daily_loss_limit_reached")
    if int(current_open_positions) < 0 or int(current_open_positions) >= max_positions:
        raise RiskRejected("maximum_open_positions_reached")

    point = _positive_number(getattr(symbol_info, "point", None), "symbol_point")
    bid = _positive_number(getattr(tick, "bid", None), "bid")
    ask = _positive_number(getattr(tick, "ask", None), "ask")
    spread_points = math.ceil((ask - bid) / point)
    if spread_points > max_spread:
        raise RiskRejected("spread_above_member_limit")

    stops_level = max(0, int(getattr(symbol_info, "trade_stops_level", 0)))
    min_stop_distance = stops_level * point
    if direction == "BUY":
        if stop_loss >= entry or take_profit <= entry:
            raise RiskRejected("invalid_buy_stop_or_target")
    else:
        if stop_loss <= entry or take_profit >= entry:
            raise RiskRejected("invalid_sell_stop_or_target")
    if abs(entry - stop_loss) < min_stop_distance:
        raise RiskRejected("stop_loss_inside_broker_minimum_distance")
    if abs(entry - take_profit) < min_stop_distance:
        raise RiskRejected("take_profit_inside_broker_minimum_distance")

    sizing = calculate_risk_volume(
        mt5_api,
        symbol=str(symbol_info.name),
        direction=direction,
        entry=entry,
        stop_loss=stop_loss,
        equity=equity,
        risk_pct=risk_pct,
        volume_min=float(symbol_info.volume_min),
        volume_max=float(symbol_info.volume_max),
        volume_step=float(symbol_info.volume_step),
    )
    order_type = mt5_api.ORDER_TYPE_BUY if direction == "BUY" else mt5_api.ORDER_TYPE_SELL
    required_margin = mt5_api.order_calc_margin(order_type, str(symbol_info.name), sizing["volume"], entry)
    if required_margin is None or not math.isfinite(float(required_margin)) or required_margin <= 0:
        raise RiskRejected("broker_margin_calculation_failed")
    if float(required_margin) > free_margin * 0.8:
        raise RiskRejected("insufficient_free_margin_buffer")

    return {
        "approved": True,
        "symbol": str(symbol_info.name),
        "direction": direction,
        **sizing,
        "spread_points": spread_points,
        "required_margin": float(required_margin),
        "max_slippage_points": max_slippage,
        "max_open_positions": max_positions,
    }
