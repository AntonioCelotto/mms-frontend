import importlib.util
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("payments_archive", ROOT / "api" / "payments-archive.py")
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)


class PaymentsArchiveTest(unittest.TestCase):
    def test_reads_all_pages_and_preserves_saved_amounts(self):
        rows = [{"id": i, "order_id": 1152, "amount": "260.00", "status": "da_pagare",
                 "payment_type": "saldo", "order": {"id": 1152, "order_number": "1131",
                 "source_quote_number": "P-0850", "client": {"name": "Cliente"}}}
                for i in range(1184, 0, -1)]
        rows[-1]["amount"] = 0
        request_module = __import__(archive.fetch_table.__module__, fromlist=["supabase_request"])

        def request(path, *, query):
            self.assertEqual(path, "/rest/v1/payments")
            self.assertIn("order:orders", query["select"])
            self.assertEqual(query["order"], "id.desc")
            return rows[query["offset"]:query["offset"] + query["limit"]]

        with patch.object(request_module, "supabase_request", side_effect=request) as reads:
            result = archive.archive_rows()
        self.assertEqual(len(result), 1184)
        self.assertEqual(reads.call_count, 2)
        self.assertEqual(result[0]["amount"], "260.00")
        self.assertEqual(result[0]["display_order_id"], 1131)
        self.assertEqual(result[0]["order_number"], "P-0850")
        self.assertEqual(result[-1]["amount"], 0)

    def test_requires_authorized_profile_before_reading_financial_data(self):
        with patch.object(archive, "require_access", return_value=None) as access, \
             patch.object(archive, "archive_rows") as rows:
            archive.handler.do_GET(SimpleNamespace())
            self.assertEqual(access.call_args.args[1], {"admin", "commerce"})
            rows.assert_not_called()

    def test_failed_request_is_not_returned_as_an_empty_archive(self):
        with patch.object(archive, "require_access", return_value={"access_profile": "admin"}), \
             patch.object(archive, "archive_rows", side_effect=RuntimeError("Database unavailable")), \
             patch.object(archive, "write_json") as write:
            archive.handler.do_GET(SimpleNamespace())
            self.assertEqual(write.call_args.args[2], 503)
            self.assertNotIn("payments", write.call_args.args[1])


if __name__ == "__main__":
    unittest.main()
