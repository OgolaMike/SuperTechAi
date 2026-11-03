import unittest
from types import SimpleNamespace

from risk import RiskRejected, calculate_risk_volume, preflight_new_order


class FakeMT5:
    ORDER_TYPE_BUY = 0
    ORDER_TYPE_SELL = 1
    SYMBOL_TRADE_MODE_DISABLED = 0

    @staticmethod
    def order_calc_profit(order_type, symbol, volume, entry, stop):
        return -100.0 * volume

    @staticmethod
    def order_calc_margin(order_type, symbol, volume, price):
        return 100.0 * volume


def fixtures():
    settings = {
        "risk_controls_enabled": True,
        "place_new_orders": True,
        "max_risk_per_trade_pct": 0.5,
        "max_daily_loss_pct": 2.0,
        "max_open_positions": 3,
        "max_spread_points": 30,
        "max_slippage_points": 10,
    }
    account = SimpleNamespace(
        equity=10000.0, margin_free=1000.0,
        trade_allowed=True, trade_expert=True,
    )
    symbol = SimpleNamespace(
        name="EURUSD", visible=True, trade_mode=4, point=0.0001,
        trade_stops_level=10, volume_min=0.01, volume_max=100.0,
        volume_step=0.01,
    )
    tick = SimpleNamespace(bid=1.1000, ask=1.1002)
    return settings, account, symbol, tick


class RiskSizingTests(unittest.TestCase):
    def test_sizes_volume_from_account_currency_loss(self):
        result = calculate_risk_volume(
            FakeMT5(), symbol="EURUSD", direction="BUY", entry=1.1,
            stop_loss=1.09, equity=10000, risk_pct=0.5,
            volume_min=0.01, volume_max=100, volume_step=0.01,
        )
        self.assertEqual(result["volume"], 0.5)
        self.assertEqual(result["risk_amount"], 50.0)
        self.assertLessEqual(result["estimated_loss"], result["risk_amount"])

    def test_preflight_approves_valid_order_without_sending_it(self):
        settings, account, symbol, tick = fixtures()
        result = preflight_new_order(
            FakeMT5(), settings=settings, account=account,
            symbol_info=symbol, tick=tick, direction="BUY",
            entry=1.1010, stop_loss=1.0990, take_profit=1.1050,
            daily_loss_pct=0.25,
        )
        self.assertTrue(result["approved"])
        self.assertEqual(result["volume"], 0.5)

    def test_blocks_when_member_permission_is_off(self):
        settings, account, symbol, tick = fixtures()
        settings["place_new_orders"] = False
        with self.assertRaisesRegex(RiskRejected, "new_order_permission_not_granted"):
            preflight_new_order(
                FakeMT5(), settings=settings, account=account,
                symbol_info=symbol, tick=tick, direction="BUY",
                entry=1.1010, stop_loss=1.0990, take_profit=1.1050,
                daily_loss_pct=0.25,
            )

    def test_blocks_when_daily_loss_limit_is_reached(self):
        settings, account, symbol, tick = fixtures()
        with self.assertRaisesRegex(RiskRejected, "daily_loss_limit_reached"):
            preflight_new_order(
                FakeMT5(), settings=settings, account=account,
                symbol_info=symbol, tick=tick, direction="BUY",
                entry=1.1010, stop_loss=1.0990, take_profit=1.1050,
                daily_loss_pct=2.0,
            )

    def test_zero_spread_limit_fails_closed(self):
        settings, account, symbol, tick = fixtures()
        settings["max_spread_points"] = 0
        with self.assertRaisesRegex(RiskRejected, "spread_and_slippage_limits_must_be_configured"):
            preflight_new_order(
                FakeMT5(), settings=settings, account=account,
                symbol_info=symbol, tick=tick, direction="BUY",
                entry=1.1010, stop_loss=1.0990, take_profit=1.1050,
                daily_loss_pct=0.25,
            )

    def test_rejects_minimum_lot_that_exceeds_risk_budget(self):
        with self.assertRaisesRegex(RiskRejected, "minimum_broker_lot_exceeds_risk_budget"):
            calculate_risk_volume(
                FakeMT5(), symbol="EURUSD", direction="BUY", entry=1.1,
                stop_loss=1.09, equity=1000, risk_pct=0.1,
                volume_min=0.1, volume_max=100, volume_step=0.1,
            )


if __name__ == "__main__":
    unittest.main()
