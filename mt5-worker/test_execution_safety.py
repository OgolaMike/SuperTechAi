import unittest

from execution_safety import (
    broker_order_check_passed,
    classify_existing_attempt,
    classify_send_result,
    make_broker_comment,
)


class ExecutionSafetyTests(unittest.TestCase):
    def test_comment_is_unique_bounded_and_stable(self):
        value = make_broker_comment("12345678-1234-5678-9abc-def012345678")
        self.assertEqual(value, "STAI:12345678123456789abcdef0")
        self.assertLessEqual(len(value), 31)

    def test_rejects_invalid_command_id(self):
        with self.assertRaisesRegex(ValueError, "invalid_execution_command_id"):
            make_broker_comment("not-a-uuid")

    def test_accepted_attempt_is_never_resent(self):
        self.assertEqual(classify_existing_attempt("accepted", None), "accepted")

    def test_dispatching_attempt_requires_broker_match(self):
        self.assertEqual(classify_existing_attempt("dispatching", None), "uncertain")
        self.assertEqual(classify_existing_attempt("dispatching", {"ticket": 12}), "accepted")

    def test_rejected_attempt_is_never_resent(self):
        self.assertEqual(classify_existing_attempt("rejected", None), "rejected")

    def test_unknown_attempt_fails_closed(self):
        self.assertEqual(classify_existing_attempt("unknown", None), "uncertain")

    def test_missing_send_result_is_uncertain(self):
        self.assertEqual(classify_send_result(False, None, {10008, 10009}), "uncertain")

    def test_broker_retcode_classification(self):
        self.assertEqual(classify_send_result(True, 10008, {10008, 10009}), "accepted")
        self.assertEqual(classify_send_result(True, 10030, {10008, 10009}), "rejected")

    def test_order_check_must_return_zero(self):
        class Check:
            retcode = 0
        class Failed:
            retcode = 10016
        self.assertTrue(broker_order_check_passed(Check()))
        self.assertFalse(broker_order_check_passed(Failed()))
        self.assertFalse(broker_order_check_passed(None))


if __name__ == "__main__":
    unittest.main()
