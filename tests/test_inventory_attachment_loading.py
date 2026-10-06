import importlib
import importlib.util
import io
import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


def load_endpoint(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "api" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class InventoryLoadingTest(unittest.TestCase):
    def test_bootstrap_keeps_prices_after_repeated_archive_refreshes(self):
        # Both import locations are used by the Python API entry points.
        for module_name in ("_supabase", "api._supabase"):
            module = importlib.import_module(module_name)
            inventory = [{"id": 192, "sku": "MMS-TEX-192", "name": "Tessuto costina",
                          "unit_cost": "4.25", "retail_price": "8.0", "available_quantity": 3},
                         {"id": 193, "sku": "MMS-TEX-193", "name": "Tessuto denim",
                          "unit_cost": 0, "retail_price": 0, "available_quantity": 0}]

            def fetch(table, **kwargs):
                return inventory if table == "inventory_items" else []

            with patch.object(module, "fetch_table", side_effect=fetch):
                for role in ("admin", "commerce"):
                    with self.subTest(module=module_name, role=role):
                        for _ in range(2):
                            items = module.build_bootstrap({"access_profile": role})["inventory"]
                            self.assertEqual(items[0]["unit_cost"], "4.25")
                            self.assertEqual(items[0]["retail_price"], "8.0")
                            self.assertEqual(items[0]["available"], 3)
                            self.assertEqual(items[1]["unit_cost"], 0)
                            self.assertEqual(items[1]["retail_price"], 0)
                self.assertEqual(module.build_bootstrap({"access_profile": "operator", "id": 22})["inventory"], [])


class PrivateAttachmentLoadingTest(unittest.TestCase):
    def test_upload_and_reopen_use_the_storage_gateway(self):
        for name in ("list-attachments", "upload-attachment"):
            module = load_endpoint(name)
            base = module.SUPABASE_URL
            relative = "/object/sign/order-attachments/orders/1142/photo.jpg?token=test"
            for returned, expected in (
                (relative, f"{base}/storage/v1{relative}"),
                (relative.lstrip("/"), f"{base}/storage/v1{relative}"),
                (f"/storage/v1{relative}", f"{base}/storage/v1{relative}"),
                (f"{base}/storage/v1{relative}", f"{base}/storage/v1{relative}"),
            ):
                with self.subTest(endpoint=name, returned=returned):
                    with patch.object(module, "urlopen", return_value=io.BytesIO(json.dumps({"signedURL": returned}).encode())) as request:
                        if name == "list-attachments":
                            actual = module.signed_storage_url("order-attachments", "orders/1142/photo.jpg")
                        else:
                            actual = module.signed_storage_url("orders/1142/photo.jpg")
                        self.assertEqual(actual, expected)
                        self.assertIn("/storage/v1/object/sign/order-attachments/orders/1142/photo.jpg", request.call_args.args[0].full_url)
                        self.assertEqual(json.loads(request.call_args.args[0].data)["expiresIn"], 3600)

    def test_reopened_order_returns_private_photo_links(self):
        module = load_endpoint("list-attachments")
        handler = SimpleNamespace(path="/api/list-attachments?order_id=1142")
        photo = {"id": 52, "file_name": "photo.jpg", "storage_bucket": "order-attachments",
                 "storage_path": "orders/1142/photo.jpg", "mime_type": "image/jpeg", "file_size": 42}
        with patch.object(module, "require_access", return_value={"access_profile": "admin"}), \
             patch.object(module, "resolve_order", return_value={"id": 1142}), \
             patch.object(module, "profile_can_access_order", return_value=True), \
             patch.object(module, "fetch_table", return_value=[photo]), \
             patch.object(module, "urlopen", return_value=io.BytesIO(b'{"signedURL":"/object/sign/order-attachments/orders/1142/photo.jpg?token=test"}')), \
             patch.object(module, "write_json") as write:
            module.handler.do_GET(handler)
            returned = write.call_args.args[1]["attachments"][0]
            self.assertEqual(returned["url"], f"{module.SUPABASE_URL}/storage/v1/object/sign/order-attachments/orders/1142/photo.jpg?token=test")
            self.assertEqual(returned["name"], "photo.jpg")
            self.assertEqual(returned["mime_type"], "image/jpeg")

    def test_unauthorized_users_cannot_request_photo_links(self):
        module = load_endpoint("list-attachments")
        with patch.object(module, "require_access", return_value=None), \
             patch.object(module, "urlopen") as storage, patch.object(module, "fetch_table") as rows:
            module.handler.do_GET(SimpleNamespace(path="/api/list-attachments?order_id=1142"))
            storage.assert_not_called()
            rows.assert_not_called()
        with patch.object(module, "require_access", return_value={"access_profile": "operator"}), \
             patch.object(module, "resolve_order", return_value={"id": 1142}), \
             patch.object(module, "profile_can_access_order", return_value=False), \
             patch.object(module, "urlopen") as storage, \
             patch.object(module, "fetch_table") as rows, patch.object(module, "write_json") as write:
            module.handler.do_GET(SimpleNamespace(path="/api/list-attachments?order_id=1142"))
            self.assertEqual(write.call_args.args[2], 403)
            storage.assert_not_called()
            rows.assert_not_called()


if __name__ == "__main__":
    unittest.main()
