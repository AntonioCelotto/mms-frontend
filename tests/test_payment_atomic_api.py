import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("sync_order_payments", ROOT / "api/sync-order-payments.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class PaymentAtomicApiTest(unittest.TestCase):
    def test_validation_preserves_ids_cents_and_historical_status(self):
        row = {"id": 2930, "payment_type": "acconto", "amount": "410,25", "status": "da_pagare",
               "paid_date": "2026-10-08", "due_date": "2026-09-30", "notes": "CONTANTI"}
        saved = api.normalize_rows([row])[0]
        self.assertEqual(saved["id"], 2930)
        self.assertEqual(saved["amount"], "410.25")
        self.assertEqual(saved["paid_date"], "2026-10-08")
        self.assertEqual(saved["status"], "da_pagare")
        self.assertEqual(api.normalize_rows([]), [])

    def test_invalid_movements_are_rejected_before_rpc(self):
        base = {"id": 1, "payment_type": "saldo", "amount": 1, "status": "da_pagare"}
        for rows in [[base, base], [{**base, "id": -1}], [{**base, "amount": "NaN"}],
                     [{**base, "amount": -1}], [{**base, "due_date": "2026-99-99"}],
                     [{**base, "status": "pagato"}], [{**base, "status": "unknown"}], None]:
            with self.subTest(rows=rows), self.assertRaises((ValueError, TypeError)):
                api.normalize_rows(rows)

    def test_unauthenticated_request_never_reaches_database(self):
        with patch.object(api, "require_access", return_value=None), patch.object(api, "supabase_request") as rpc:
            api.handler.do_POST(object())
            rpc.assert_not_called()

    def test_exact_database_id_and_snapshot_are_sent_to_one_rpc(self):
        payload = {"order_id": 1131, "expected": [], "payments": []}
        with patch.object(api, "require_access", return_value={"access_profile": "admin"}), \
             patch.object(api, "read_json_body", return_value=payload), \
             patch.object(api, "supabase_request", return_value=[]) as rpc, patch.object(api, "write_json") as write:
            api.handler.do_POST(object())
            self.assertEqual(rpc.call_args.kwargs["payload"], {"p_order_id": 1131, "p_expected": [], "p_rows": []})
            self.assertEqual(write.call_args.args[1], {"payments": []})

    def test_conflict_is_reported_without_retrying_or_exposing_technical_errors(self):
        for code, status in [("PT409", 409), ("PT400", 400), ("PT404", 404), ("other", 503)]:
            with self.subTest(code=code), patch.object(api, "require_access", return_value={"access_profile": "admin"}), \
                 patch.object(api, "read_json_body", return_value={"order_id": 1131, "expected": [], "payments": []}), \
                 patch.object(api, "supabase_request", side_effect=RuntimeError(json.dumps({"code": code, "message": "Conflitto"}))) as rpc, \
                 patch.object(api, "write_json") as write:
                api.handler.do_POST(object())
                self.assertEqual(write.call_args.args[2], status)
                self.assertEqual(rpc.call_count, 1)


if __name__ == "__main__":
    unittest.main()
