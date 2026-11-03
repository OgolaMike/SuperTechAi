"""SuperTech AI MT5 bridge worker (read-only first release).

Run on Windows beside a MetaTrader 5 terminal that the account owner has
already logged into. This worker never accepts/stores broker passwords and
never places, modifies, or closes trades.
"""
from __future__ import annotations

import json
import logging
import os
import platform
import time
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import keyring
import MetaTrader5 as mt5

SERVICE_NAME = "SuperTechAI-MT5-Bridge"
VERSION = "0.1.0"
POLL_SECONDS = max(3, int(os.getenv("STAI_POLL_SECONDS", "5")))
API_URL = os.environ["STAI_BRIDGE_URL"].rstrip("/") + "/functions/v1/mt5-bridge"
WORKER_ID = os.environ["STAI_WORKER_ID"]
TERMINAL_PATH = os.getenv("STAI_MT5_TERMINAL_PATH")
LOG_LEVEL = os.getenv("STAI_LOG_LEVEL", "INFO").upper()

logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("supertech-mt5")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_worker_token() -> str:
    token = keyring.get_password(SERVICE_NAME, WORKER_ID)
    if not token or len(token) < 32:
        raise RuntimeError(
            "Worker token is missing. Run provision_token.py from this folder."
        )
    return token


def api_call(token: str, body: dict[str, Any]) -> dict[str, Any]:
    raw = json.dumps(body, separators=(",", ":")).encode("utf-8")
    request = Request(
        API_URL,
        data=raw,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "X-MT5-Worker-ID": WORKER_ID,
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        # Do not log request headers/body: they contain the worker credential.
        raise RuntimeError(f"Bridge HTTP error {exc.code}") from None
    except URLError:
        raise RuntimeError("Bridge is temporarily unreachable") from None


def mt5_ready() -> None:
    initialized = mt5.initialize(path=TERMINAL_PATH) if TERMINAL_PATH else mt5.initialize()
    if not initialized:
        raise RuntimeError(f"MT5 terminal initialization failed ({mt5.last_error()[0]})")
    terminal = mt5.terminal_info()
    account = mt5.account_info()
    if terminal is None or account is None:
        raise RuntimeError("MT5 terminal is open but no account is logged in")
    if not terminal.connected:
        raise RuntimeError("MT5 terminal is not connected to the broker")


def safe_account_snapshot() -> dict[str, Any]:
    account = mt5.account_info()
    terminal = mt5.terminal_info()
    if account is None or terminal is None:
        raise RuntimeError("MT5 account information unavailable")
    return {
        "login": str(account.login),
        "server": str(account.server),
        "company": str(account.company),
        "currency": str(account.currency),
        "trade_mode": int(account.trade_mode),
        "connected": bool(terminal.connected),
        "balance": float(account.balance),
        "equity": float(account.equity),
        "margin_free": float(account.margin_free),
        "observed_at": utc_now(),
    }



def utc_day_deal_summary() -> dict[str, Any]:
    """Summarize broker deal history from UTC midnight without storing credentials."""
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    deals = mt5.history_deals_get(start, now)
    if deals is None:
        raise RuntimeError("Could not read today's MT5 deal history")
    cash_types = {
        getattr(mt5, "DEAL_TYPE_BALANCE", -1001),
        getattr(mt5, "DEAL_TYPE_CREDIT", -1002),
        getattr(mt5, "DEAL_TYPE_CHARGE", -1003),
        getattr(mt5, "DEAL_TYPE_CORRECTION", -1004),
        getattr(mt5, "DEAL_TYPE_BONUS", -1005),
    }
    cash_flow = 0.0
    realized_net = 0.0
    latest_deal_time = None
    for deal in deals:
        deal_type = int(getattr(deal, "type", -1))
        profit = float(getattr(deal, "profit", 0.0))
        commission = float(getattr(deal, "commission", 0.0))
        swap = float(getattr(deal, "swap", 0.0))
        fee = float(getattr(deal, "fee", 0.0))
        if deal_type in cash_types:
            cash_flow += profit
        else:
            realized_net += profit + commission + swap + fee
        deal_time = int(getattr(deal, "time", 0))
        latest_deal_time = max(latest_deal_time or 0, deal_time)
    return {
        "cash_flow_adjustment": round(cash_flow, 8),
        "realized_trading_net": round(realized_net, 8),
        "deal_count": len(deals),
        "history_complete": True,
        "history_from": start.isoformat(),
        "latest_deal_epoch": latest_deal_time,
    }

def pending_orders_snapshot() -> dict[str, Any]:
    orders = mt5.orders_get()
    if orders is None:
        raise RuntimeError(f"Could not read pending orders ({mt5.last_error()[0]})")
    rows = []
    for order in orders:
        rows.append({
            "ticket": int(order.ticket),
            "symbol": str(order.symbol),
            "type": int(order.type),
            "volume_initial": float(order.volume_initial),
            "volume_current": float(order.volume_current),
            "price_open": float(order.price_open),
            "sl": float(order.sl),
            "tp": float(order.tp),
            "time_setup": int(order.time_setup),
            "comment": str(order.comment)[:80],
        })
    return {"pending_orders": rows, "count": len(rows), "observed_at": utc_now()}


def positions_snapshot() -> dict[str, Any]:
    positions = mt5.positions_get()
    if positions is None:
        raise RuntimeError(f"Could not read open positions ({mt5.last_error()[0]})")
    rows = []
    for position in positions:
        rows.append({
            "ticket": int(position.ticket),
            "symbol": str(position.symbol),
            "type": int(position.type),
            "volume": float(position.volume),
            "price_open": float(position.price_open),
            "price_current": float(position.price_current),
            "sl": float(position.sl),
            "tp": float(position.tp),
            "profit": float(position.profit),
            "time": int(position.time),
            "comment": str(position.comment)[:80],
        })
    return {"positions": rows, "count": len(rows), "observed_at": utc_now()}


def execute_read_only(command: dict[str, Any]) -> dict[str, Any]:
    command_type = command.get("command_type")
    if command_type == "pause_trading":
        # Safe no-op acknowledgement: this worker has no trade execution path.
        return {"paused": True, "message": "Read-only worker; no orders can be sent."}
    mt5_ready()
    if command_type == "sync_account":
        return safe_account_snapshot()
    if command_type == "list_pending_orders":
        return pending_orders_snapshot()
    if command_type == "list_positions":
        return positions_snapshot()
    # Explicit deny-by-default. Never attempt an unknown or trading command.
    raise ValueError("command_not_supported_by_read_only_worker")


def complete(token: str, command_id: str, succeeded: bool,
             result: dict[str, Any] | None = None, error_code: str | None = None) -> None:
    api_call(token, {
        "action": "complete",
        "commandId": command_id,
        "succeeded": succeeded,
        "result": result or {},
        "errorCode": error_code,
    })


def main() -> None:
    token = get_worker_token()
    log.info("Starting SuperTech AI MT5 read-only worker %s on %s", VERSION, platform.node())
    backoff = 2
    while True:
        try:
            mt5_ready()
            account_snapshot = safe_account_snapshot()
            api_call(token, {
                "action": "heartbeat",
                "version": VERSION,
                "account": {
                    "login": account_snapshot["login"],
                    "server": account_snapshot["server"],
                    "balance": account_snapshot["balance"],
                    "equity": account_snapshot["equity"],
                    "deal_summary": utc_day_deal_summary(),
                },
            })
            response = api_call(token, {"action": "poll"})
            for command in response.get("commands", []):
                command_id = str(command.get("id", ""))
                if not command_id:
                    continue
                try:
                    result = execute_read_only(command)
                    complete(token, command_id, True, result=result)
                except Exception as exc:
                    # Only a fixed error category is returned; never expose local paths/secrets.
                    log.warning("Command %s rejected or failed: %s", command_id, type(exc).__name__)
                    complete(token, command_id, False, error_code="read_only_command_failed")
            backoff = 2
            time.sleep(POLL_SECONDS)
        except KeyboardInterrupt:
            log.info("Stopping worker")
            break
        except Exception as exc:
            log.warning("Bridge cycle failed: %s", type(exc).__name__)
            time.sleep(backoff)
            backoff = min(backoff * 2, 60)
    mt5.shutdown()


if __name__ == "__main__":
    main()
