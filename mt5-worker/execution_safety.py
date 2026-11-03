"""Fail-closed helpers for MT5 execution idempotency and result classification."""
from __future__ import annotations

import re
from typing import Any


def make_broker_comment(command_id: str) -> str:
    compact = str(command_id).replace("-", "").lower()
    if not re.fullmatch(r"[0-9a-f]{32}", compact):
        raise ValueError("invalid_execution_command_id")
    return "STAI:" + compact[:26]


def classify_existing_attempt(state: str, broker_match: dict[str, Any] | None) -> str:
    """Never authorize a second send for an attempt already persisted as dispatching."""
    state = str(state).lower()
    if state == "accepted":
        return "accepted"
    if state == "rejected":
        return "rejected"
    if state in {"dispatching", "uncertain"}:
        return "accepted" if broker_match else "uncertain"
    return "uncertain"


def classify_send_result(result_present: bool, retcode: int | None,
                          accepted_codes: set[int]) -> str:
    if not result_present or retcode is None:
        return "uncertain"
    return "accepted" if int(retcode) in accepted_codes else "rejected"


def broker_order_check_passed(check_result: Any) -> bool:
    return check_result is not None and int(getattr(check_result, "retcode", -1)) == 0
