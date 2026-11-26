"""Pure rules for the raw 30-minute Higher High / Lower Low strategy."""
from decimal import Decimal, ROUND_FLOOR
from typing import Any

BAR_SECONDS = 1800
MOMENTUM_MAGIC = 601026
MOMENTUM_COMMENT_PREFIX = "STAI5M:"


def detect_signal(previous: Any, latest: Any) -> str | None:
    """Match the original EA order: Higher High wins if both conditions occur."""
    if float(latest["high"]) > float(previous["high"]):
        return "BUY"
    if float(latest["low"]) < float(previous["low"]):
        return "SELL"
    return None


def normalize_volume(requested: float, minimum: float, maximum: float, step: float) -> float:
    """Clamp and floor volume to the broker's min/max/step grid."""
    requested_d, minimum_d, maximum_d, step_d = (
        Decimal(str(value)) for value in (requested, minimum, maximum, step)
    )
    if minimum_d <= 0 or maximum_d < minimum_d or step_d <= 0:
        raise ValueError("invalid_broker_volume_rules")
    bounded = min(max(requested_d, minimum_d), maximum_d)
    steps = ((bounded - minimum_d) / step_d).to_integral_value(rounding=ROUND_FLOOR)
    volume = minimum_d + steps * step_d
    return float(volume)


def position_is_due_to_close(position_open_epoch: int, now_epoch: int) -> bool:
    """Close at the end of the M30 candle in which the position was opened."""
    candle_open = (int(position_open_epoch) // BAR_SECONDS) * BAR_SECONDS
    return int(now_epoch) >= candle_open + BAR_SECONDS
