"""SuperTech AI MT5 bridge worker.

Places only explicitly approved SuperTech AI pending orders. It never
accepts/stores broker passwords or manages unowned manual trades.
"""
from __future__ import annotations

import json
import logging
import os
import platform
import time
from datetime import datetime, timezone, timedelta
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import keyring
import MetaTrader5 as mt5
from risk import preflight_new_order, RiskRejected
from pending_orders import validate_pending_order_geometry, PendingOrderRejected
from execution_safety import make_broker_comment, classify_existing_attempt, classify_send_result, broker_order_check_passed

SERVICE_NAME = "SuperTechAI-MT5-Bridge"
VERSION = "0.2.0"
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
            "identifier": int(getattr(order, "ticket", 0)),
            "magic": int(getattr(order, "magic", 0)),
            "reason": int(getattr(order, "reason", -1)),
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
            "identifier": int(getattr(position, "identifier", position.ticket)),
            "magic": int(getattr(position, "magic", 0)),
            "reason": int(getattr(position, "reason", -1)),
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



def find_broker_order_by_comment(comment: str) -> dict[str, Any] | None:
    """Find an earlier submission in live or historical broker records."""
    orders = mt5.orders_get()
    if orders is not None:
        for order in orders:
            if str(getattr(order, "comment", "")) == comment:
                return {"ticket": int(order.ticket), "state": "pending",
                        "symbol": str(order.symbol), "price": float(order.price_open)}
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=7)
    history_orders = mt5.history_orders_get(start, end)
    if history_orders is not None:
        for order in history_orders:
            if str(getattr(order, "comment", "")) == comment:
                return {"ticket": int(order.ticket), "state": "history",
                        "symbol": str(order.symbol), "price": float(order.price_open)}
    deals = mt5.history_deals_get(start, end)
    if deals is not None:
        for deal in deals:
            if str(getattr(deal, "comment", "")) == comment:
                return {"ticket": int(getattr(deal, "order", 0)),
                        "deal": int(deal.ticket), "state": "deal_history",
                        "symbol": str(deal.symbol), "price": float(deal.price)}
    return None


def execute_pending_order(token: str, command: dict[str, Any]) -> dict[str, Any]:
    mt5_ready()
    payload = command.get("payload") or {}
    command_id = str(command.get("id", ""))
    account = mt5.account_info()
    if account is None:
        raise RiskRejected("account_snapshot_unavailable")
    if str(account.login) != str(payload.get("login")) or str(account.server) != str(payload.get("server")):
        raise RiskRejected("account_identity_mismatch")

    authorization = api_call(token, {
        "action": "authorize_pending_order_execution",
        "commandId": command_id,
    })
    if authorization.get("error") or not authorization.get("ok"):
        raise RiskRejected(str(authorization.get("error", "server_execution_authorization_failed")))
    attempt = authorization.get("attempt") or {}
    broker_comment = str(authorization.get("broker_comment") or attempt.get("broker_comment") or "")
    if not broker_comment:
        broker_comment = make_broker_comment(command_id)

    if not authorization.get("new_attempt"):
        existing_state = str(attempt.get("state", "unknown"))
        if existing_state == "accepted":
            return {"execution_state": "accepted", "reconciled": True,
                    "broker_ticket": attempt.get("broker_ticket"),
                    "broker_deal": attempt.get("broker_deal"),
                    "broker_retcode": attempt.get("broker_retcode"),
                    "broker_message": "Previously accepted execution; not resubmitted."}
        if existing_state == "rejected":
            return {"execution_state": "rejected", "reconciled": True,
                    "broker_message": "This execution attempt was already rejected; it will not be resubmitted."}
        found = find_broker_order_by_comment(broker_comment)
        state = classify_existing_attempt(existing_state, found)
        if state == "accepted":
            return {"execution_state": "accepted", "reconciled": True,
                    "broker_ticket": found.get("ticket") if found else attempt.get("broker_ticket"),
                    "broker_deal": found.get("deal") if found else attempt.get("broker_deal"),
                    "broker_message": "Matched an existing broker order/deal by unique SuperTech AI comment. Not resubmitted."}
        return {"execution_state": "uncertain", "reconciled": False,
                "broker_message": "A prior send attempt exists but no matching broker record was found. NOT resent; manual broker review is required."}

    try:
        symbol_name = str(payload.get("symbol", "")).strip()
        if not symbol_name or len(symbol_name) > 40 or not mt5.symbol_select(symbol_name, True):
            raise RiskRejected("symbol_not_available")
        symbol_info = mt5.symbol_info(symbol_name)
        tick = mt5.symbol_info_tick(symbol_name)
        positions = mt5.positions_get()
        pending_orders = mt5.orders_get()
        terminal = mt5.terminal_info()
        if symbol_info is None or tick is None or positions is None or pending_orders is None or terminal is None:
            raise RiskRejected("live_market_or_positions_unavailable")
        if bool(getattr(terminal, "tradeapi_disabled", False)):
            raise RiskRejected("terminal_algorithmic_trading_disabled")
        direction = str(payload.get("direction", "")).upper()
        order_type = str(payload.get("order_type", "")).upper()
        entry = float(payload.get("entry", 0))
        stop_loss = float(payload.get("stop_loss", 0))
        take_profit = float(payload.get("take_profit", 0))
        try:
            validate_pending_order_geometry(
                order_type=order_type, direction=direction, entry=entry,
                stop_loss=stop_loss, take_profit=take_profit,
                bid=float(tick.bid), ask=float(tick.ask),
                point=float(symbol_info.point),
                stops_level=int(getattr(symbol_info, "trade_stops_level", 0)),
            )
        except PendingOrderRejected as exc:
            raise RiskRejected(str(exc)) from None

        trade_mode = int(getattr(symbol_info, "trade_mode", 0))
        if trade_mode in {
            int(getattr(mt5, "SYMBOL_TRADE_MODE_DISABLED", -1)),
            int(getattr(mt5, "SYMBOL_TRADE_MODE_CLOSEONLY", -2)),
        }:
            raise RiskRejected("symbol_not_open_for_new_trades")
        if trade_mode == int(getattr(mt5, "SYMBOL_TRADE_MODE_LONGONLY", -3)) and direction != "BUY":
            raise RiskRejected("symbol_allows_long_only")
        if trade_mode == int(getattr(mt5, "SYMBOL_TRADE_MODE_SHORTONLY", -4)) and direction != "SELL":
            raise RiskRejected("symbol_allows_short_only")

        settings = authorization.get("settings") or {}
        sizing = preflight_new_order(
            mt5, settings=settings, account=account, symbol_info=symbol_info, tick=tick,
            direction=direction, entry=entry, stop_loss=stop_loss, take_profit=take_profit,
            daily_loss_pct=float(authorization.get("daily_loss_pct", 100)),
            current_open_positions=len(positions) + len(pending_orders),
        )
        order_types = {
            "BUY_STOP": mt5.ORDER_TYPE_BUY_STOP,
            "SELL_STOP": mt5.ORDER_TYPE_SELL_STOP,
            "BUY_LIMIT": mt5.ORDER_TYPE_BUY_LIMIT,
            "SELL_LIMIT": mt5.ORDER_TYPE_SELL_LIMIT,
        }
        if order_type not in order_types:
            raise RiskRejected("unsupported_pending_order_type")
        request = {
            "action": mt5.TRADE_ACTION_PENDING,
            "symbol": symbol_name,
            "volume": sizing["volume"],
            "type": order_types[order_type],
            "price": entry,
            "sl": stop_loss,
            "tp": take_profit,
            "deviation": int(settings["max_slippage_points"]),
            "magic": 601025,
            "comment": broker_comment,
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_RETURN,
        }
        check = mt5.order_check(request)
        if not broker_order_check_passed(check):
            raise RiskRejected("broker_order_check_rejected")
        final_auth = api_call(token, {
            "action": "confirm_pending_order_send",
            "commandId": command_id,
        })
        if final_auth.get("error") or final_auth.get("final_authorization") is not True:
            raise RiskRejected(str(final_auth.get("error", "final_server_authorization_failed")))
    except Exception as exc:
        message = str(exc)[:120] if isinstance(exc, RiskRejected) else "Final broker pre-check failed."
        return {"execution_state": "rejected", "broker_message": message}

    # The server has already persisted a dispatching attempt. Ambiguous send
    # outcomes are never blindly retried; later leases reconcile by comment.
    try:
        result = mt5.order_send(request)
    except Exception:
        return {"execution_state": "uncertain",
                "broker_message": "MT5 send raised an exception; outcome unknown. Do not retry automatically."}
    if result is None:
        return {"execution_state": "uncertain",
                "broker_message": "MT5 returned no send result. Outcome unknown; do not retry automatically."}

    retcode = int(getattr(result, "retcode", -1))
    accepted_codes = {
        int(getattr(mt5, "TRADE_RETCODE_PLACED", 10008)),
        int(getattr(mt5, "TRADE_RETCODE_DONE", 10009)),
    }
    send_state = classify_send_result(True, retcode, accepted_codes)
    if send_state != "accepted":
        return {"execution_state": send_state, "broker_retcode": retcode,
                "broker_message": str(getattr(result, "comment", "Broker rejected request"))[:120]}
    return {
        "execution_state": "accepted",
        "broker_ticket": int(getattr(result, "order", 0) or 0) or None,
        "broker_deal": int(getattr(result, "deal", 0) or 0) or None,
        "broker_retcode": retcode,
        "broker_message": str(getattr(result, "comment", "Pending order accepted"))[:120],
        "symbol": symbol_name, "order_type": order_type,
        "volume": sizing["volume"], "estimated_loss": sizing["estimated_loss"],
        "risk_amount": sizing["risk_amount"], "entry": entry,
        "stop_loss": stop_loss, "take_profit": take_profit,
        "account_login": str(account.login), "account_server": str(account.server),
        "account_trade_mode": int(account.trade_mode), "broker_comment": broker_comment,
    }


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
    if command_type == "preflight_pending_order":
        payload = command.get("payload") or {}
        account = mt5.account_info()
        if account is None:
            raise RuntimeError("account_snapshot_unavailable")
        if str(account.login) != str(payload.get("login")) or str(account.server) != str(payload.get("server")):
            raise RuntimeError("account_identity_mismatch")
        symbol_name = str(payload.get("symbol", ""))
        if not symbol_name or len(symbol_name) > 40:
            raise RiskRejected("invalid_symbol")
        if not mt5.symbol_select(symbol_name, True):
            raise RiskRejected("symbol_not_available")
        symbol_info = mt5.symbol_info(symbol_name)
        tick = mt5.symbol_info_tick(symbol_name)
        if symbol_info is None or tick is None:
            raise RiskRejected("symbol_market_data_unavailable")
        positions = mt5.positions_get()
        if positions is None:
            raise RiskRejected("open_positions_unavailable")
        direction = str(payload.get("direction", "")).upper()
        order_type = str(payload.get("order_type", "")).upper()
        entry = float(payload.get("entry", 0))
        stop_loss = float(payload.get("stop_loss", 0))
        take_profit = float(payload.get("take_profit", 0))
        try:
            validate_pending_order_geometry(
                order_type=order_type, direction=direction, entry=entry,
                stop_loss=stop_loss, take_profit=take_profit,
                bid=float(tick.bid), ask=float(tick.ask),
                point=float(symbol_info.point),
                stops_level=int(getattr(symbol_info, "trade_stops_level", 0)),
            )
        except PendingOrderRejected as exc:
            raise RiskRejected(str(exc)) from None
        result = preflight_new_order(
            mt5, settings=payload.get("settings") or {}, account=account,
            symbol_info=symbol_info, tick=tick, direction=direction,
            entry=entry, stop_loss=stop_loss, take_profit=take_profit,
            daily_loss_pct=float(payload.get("daily_loss_pct", 0)),
            current_open_positions=len(positions),
        )
        return {"preflight": "approved", "dry_run_only": True, "order_type": order_type,
                "entry": entry, "stop_loss": stop_loss, "take_profit": take_profit,
                "account_login": str(account.login), "account_server": str(account.server),
                "account_trade_mode": int(account.trade_mode), **result}
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
                    if command.get("command_type") == "place_pending_order":
                        result = execute_pending_order(token, command)
                        state = result.get("execution_state")
                        complete(token, command_id, state in {"accepted", "uncertain"}, result=result,
                                 error_code=None if state in {"accepted", "uncertain"} else "broker_order_rejected")
                    else:
                        result = execute_read_only(command)
                        complete(token, command_id, True, result=result)
                except Exception as exc:
                    log.warning("Command %s rejected or failed: %s", command_id, type(exc).__name__)
                    complete(token, command_id, False, error_code="worker_command_failed")
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
