"""Pure validation for MT5 pending-order geometry; no broker calls."""
from __future__ import annotations

import math
from typing import Any


class PendingOrderRejected(ValueError):
    """Raised when pending-order direction or price geometry is invalid."""


ORDER_DIRECTIONS = {
    "BUY_STOP": "BUY",
    "BUY_LIMIT": "BUY",
    "SELL_STOP": "SELL",
    "SELL_LIMIT": "SELL",
}


def validate_pending_order_geometry(
    *,
    order_type: str,
    direction: str,
    entry: Any,
    stop_loss: Any,
    take_profit: Any,
    bid: Any,
    ask: Any,
    point: Any,
    stops_level: Any,
) -> dict[str, float | str]:
    order_type = str(order_type).upper()
    direction = str(direction).upper()
    if order_type not in ORDER_DIRECTIONS:
        raise PendingOrderRejected("unsupported_pending_order_type")
    if ORDER_DIRECTIONS[order_type] != direction:
        raise PendingOrderRejected("order_type_direction_mismatch")

    values = {}
    for name, value in (("entry", entry), ("stop_loss", stop_loss),
                        ("take_profit", take_profit), ("bid", bid),
                        ("ask", ask), ("point", point)):
        try:
            number = float(value)
        except (TypeError, ValueError):
            raise PendingOrderRejected(f"invalid_{name}") from None
        if not math.isfinite(number) or number <= 0:
            raise PendingOrderRejected(f"invalid_{name}")
        values[name] = number
    try:
        level = int(stops_level)
    except (TypeError, ValueError):
        raise PendingOrderRejected("invalid_stops_level") from None
    if level < 0 or values["ask"] < values["bid"]:
        raise PendingOrderRejected("invalid_market_snapshot")

    distance = max(1, level) * values["point"]
    entry_price = values["entry"]
    if direction == "BUY":
        if not (values["stop_loss"] < entry_price < values["take_profit"]):
            raise PendingOrderRejected("invalid_buy_stop_or_target")
        if order_type == "BUY_STOP" and entry_price < values["ask"] + distance:
            raise PendingOrderRejected("buy_stop_entry_not_above_market")
        if order_type == "BUY_LIMIT" and entry_price > values["ask"] - distance:
            raise PendingOrderRejected("buy_limit_entry_not_below_market")
    else:
        if not (values["take_profit"] < entry_price < values["stop_loss"]):
            raise PendingOrderRejected("invalid_sell_stop_or_target")
        if order_type == "SELL_STOP" and entry_price > values["bid"] - distance:
            raise PendingOrderRejected("sell_stop_entry_not_below_market")
        if order_type == "SELL_LIMIT" and entry_price < values["bid"] + distance:
            raise PendingOrderRejected("sell_limit_entry_not_above_market")

    if (abs(entry_price - values["stop_loss"]) < distance or
            abs(entry_price - values["take_profit"]) < distance):
        raise PendingOrderRejected("sl_or_tp_inside_broker_minimum_distance")
    return {"order_type": order_type, "direction": direction, **values,
            "minimum_distance": distance}
