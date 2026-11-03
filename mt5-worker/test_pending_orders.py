import unittest

from pending_orders import PendingOrderRejected, validate_pending_order_geometry


class PendingOrderGeometryTests(unittest.TestCase):
    def validate(self, order_type, direction, entry, sl, tp):
        return validate_pending_order_geometry(
            order_type=order_type, direction=direction, entry=entry,
            stop_loss=sl, take_profit=tp, bid=1.1000, ask=1.1002,
            point=0.0001, stops_level=10,
        )

    def test_buy_stop_valid(self):
        self.assertEqual(self.validate("BUY_STOP", "BUY", 1.1020, 1.0990, 1.1080)["direction"], "BUY")

    def test_buy_limit_valid(self):
        self.assertEqual(self.validate("BUY_LIMIT", "BUY", 1.0980, 1.0950, 1.1040)["order_type"], "BUY_LIMIT")

    def test_sell_stop_valid(self):
        self.assertEqual(self.validate("SELL_STOP", "SELL", 1.0980, 1.1010, 1.0920)["direction"], "SELL")

    def test_sell_limit_valid(self):
        self.assertEqual(self.validate("SELL_LIMIT", "SELL", 1.1020, 1.1050, 1.0960)["order_type"], "SELL_LIMIT")

    def test_rejects_direction_type_mismatch(self):
        with self.assertRaisesRegex(PendingOrderRejected, "order_type_direction_mismatch"):
            self.validate("SELL_STOP", "BUY", 1.0980, 1.0950, 1.1040)

    def test_rejects_buy_stop_below_market(self):
        with self.assertRaisesRegex(PendingOrderRejected, "buy_stop_entry_not_above_market"):
            self.validate("BUY_STOP", "BUY", 1.1005, 1.0970, 1.1060)

    def test_rejects_sell_limit_below_market(self):
        with self.assertRaisesRegex(PendingOrderRejected, "sell_limit_entry_not_above_market"):
            self.validate("SELL_LIMIT", "SELL", 1.1005, 1.1030, 1.0970)

    def test_rejects_invalid_sl_tp_geometry(self):
        with self.assertRaisesRegex(PendingOrderRejected, "invalid_buy_stop_or_target"):
            self.validate("BUY_LIMIT", "BUY", 1.0980, 1.0990, 1.1040)

    def test_rejects_nan_prices(self):
        with self.assertRaisesRegex(PendingOrderRejected, "invalid_entry"):
            self.validate("BUY_STOP", "BUY", float("nan"), 1.0990, 1.1080)

    def test_rejects_stops_inside_broker_minimum_distance(self):
        with self.assertRaisesRegex(PendingOrderRejected, "sl_or_tp_inside_broker_minimum_distance"):
            self.validate("BUY_STOP", "BUY", 1.1020, 1.1015, 1.1025)


if __name__ == "__main__":
    unittest.main()
