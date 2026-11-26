import unittest

from five_minute_momentum import detect_signal, normalize_volume, position_is_due_to_close


class FiveMinuteMomentumTests(unittest.TestCase):
    def test_higher_high_is_buy(self):
        self.assertEqual(detect_signal({"high": 10, "low": 5}, {"high": 11, "low": 6}), "BUY")

    def test_lower_low_is_sell(self):
        self.assertEqual(detect_signal({"high": 10, "low": 5}, {"high": 9, "low": 4}), "SELL")

    def test_no_new_extreme_is_no_trade(self):
        self.assertIsNone(detect_signal({"high": 10, "low": 5}, {"high": 10, "low": 5}))

    def test_higher_high_wins_if_both_extremes_break(self):
        self.assertEqual(detect_signal({"high": 10, "low": 5}, {"high": 11, "low": 4}), "BUY")

    def test_volume_is_clamped_and_floored_to_broker_step(self):
        self.assertAlmostEqual(normalize_volume(0.1, 0.2, 5.0, 0.2), 0.2)
        self.assertAlmostEqual(normalize_volume(0.59, 0.1, 5.0, 0.1), 0.5)
        self.assertAlmostEqual(normalize_volume(10.0, 0.1, 1.0, 0.1), 1.0)

    def test_close_occurs_at_exact_thirty_minute_boundary(self):
        self.assertFalse(position_is_due_to_close(1800, 3599))
        self.assertTrue(position_is_due_to_close(1800, 3600))


if __name__ == "__main__":
    unittest.main()
