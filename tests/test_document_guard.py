import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


def load_api(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "api" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DocumentGuardTest(unittest.TestCase):
    def test_existing_quote_prevents_second_order_before_rpc(self):
        module = load_api("create-order")
        with patch.object(module, "require_access", return_value={"access_profile": "admin"}), \
             patch.object(module, "read_json_body", return_value={"client": "Cliente", "source_quote_number": "P-847"}), \
             patch.object(module, "fetch_table", return_value=[{"id": 41, "order_number": 847}]), \
             patch.object(module, "supabase_request") as insert, \
             patch.object(module, "write_json") as write:
            module.handler.do_POST(object())
            insert.assert_not_called()
            self.assertEqual(write.call_args.args[1]["order"]["id"], 41)
            self.assertEqual(write.call_args.args[2], 409)

    def test_change_marker_reads_only_one_row(self):
        module = load_api("sync-state")
        with patch.object(module, "supabase_request", side_effect=[
            [{"id": 21, "updated_at": "2026-09-29T12:00:00Z"}], [{"id": 22}]
        ]) as request:
            self.assertEqual(module.marker("orders"), {"updated": "2026-09-29T12:00:00Z", "id": 22})
            self.assertTrue(all(call.kwargs["query"]["limit"] == 1 for call in request.call_args_list))


if __name__ == "__main__":
    unittest.main()
