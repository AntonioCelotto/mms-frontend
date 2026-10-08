import importlib
import unittest
from unittest.mock import patch


class OrderPaymentSnapshotTest(unittest.TestCase):
    def test_every_order_has_current_payments_including_zero_and_old_rows(self):
        for module_name in ("_supabase", "api._supabase"):
            module = importlib.import_module(module_name)
            payments = [
                {"id": n, "order_id": 1152, "payment_type": "acconto",
                 "amount": 10, "status": "pagato", "paid_date": "2026-10-01"}
                for n in range(30, 1, -1)
            ] + [{"id": 1, "order_id": 1175, "payment_type": "saldo", "amount": 0,
                  "status": "da_pagare", "due_date": "2026-10-31"}]
            tables = {"orders": [{"id": 1152, "order_number": "1131", "client_id": 168},
                                  {"id": 1175, "order_number": "1153", "client_id": 8}]}

            def fetch(table, **kwargs):
                return payments if table == "payments" else tables.get(table, [])

            with patch.object(module, "fetch_table", side_effect=fetch) as requests:
                for role in ("admin", "commerce"):
                    with self.subTest(module=module_name, role=role):
                        payload = module.build_bootstrap({"access_profile": role})
                        self.assertEqual(len(payload["payments"]), 20)
                        first, zero = payload["orders"]
                        self.assertEqual(len(first["paymentRows"]), 29)
                        self.assertEqual([row["id"] for row in first["paymentRows"]], list(range(2, 31)))
                        self.assertEqual(zero["paymentRows"][0]["amount"], 0)
                        self.assertEqual(zero["paymentRows"][0]["due_date"], "2026-10-31")
                payments[-1]["amount"] = 45
                self.assertEqual(module.build_bootstrap({"access_profile": "admin"})["orders"][1]["paymentRows"][0]["amount"], 45)
                payment_reads = [call for call in requests.call_args_list if call.args[0] == "payments"]
                self.assertEqual(len(payment_reads), 3, "No additional database reads for the snapshot")

    def test_operator_payload_does_not_expose_payment_amounts(self):
        tables = {
            "orders": [{"id": 1152, "order_number": "1131", "client_id": 168, "total": 366}],
            "payments": [{"id": 3368, "order_id": 1152, "amount": 260, "status": "da_pagare"}],
            "order_tasks": [{"id": 1, "order_id": 1152, "department_id": 1, "assigned_user_id": 22,
                             "task_name": "Controllo", "task_phase": "controllo"}],
        }
        for module_name in ("_supabase", "api._supabase"):
            module = importlib.import_module(module_name)
            with self.subTest(module=module_name), \
                 patch.object(module, "fetch_table", side_effect=lambda table, **kw: tables.get(table, [])), \
                 patch.object(module, "schedule_task_segments", return_value={}):
                payload = module.build_bootstrap({"access_profile": "operator", "id": 22})
                self.assertEqual(len(payload["orders"]), 1)
                self.assertEqual(payload["orders"][0]["paymentRows"], [])
                self.assertEqual(payload["orders"][0]["total"], 0)
                self.assertEqual(payload["payments"], [])


if __name__ == "__main__":
    unittest.main()
