from __future__ import annotations

import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _supabase import delete_rows, fetch_table, insert_rows, resolve_order


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        payload = self.read_json_body()
        if payload is None:
            return self.write_json({"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        order = resolve_order(int(payload.get("order_id") or 0))
        if not order:
            return self.write_json({"error": "Ordine non trovato"}, HTTPStatus.NOT_FOUND)

        delete_rows("order_materials", filters={"order_id": f"eq.{order['id']}"})
        for item in payload.get("materials", []):
            product_name = (item.get("product_name") or item.get("material") or "").strip()
            if not product_name:
                continue
            source_type = "mms" if (item.get("source_type") or item.get("source") or "").strip().lower() == "mms" else "cliente"
            delivery_status = "consegnato" if (item.get("delivery_status") or item.get("delivery") or "").strip().lower() == "consegnato" else "non_consegnato"
            inventory_item_id = None
            inventory_sku = (item.get("inventory_sku") or "").strip()
            if source_type == "mms" and inventory_sku:
                rows = fetch_table("inventory_items", filters={"sku": f"eq.{inventory_sku}"})
                inventory_item_id = rows[0]["id"] if rows else None
            insert_rows(
                "order_materials",
                {
                    "order_id": order["id"],
                    "inventory_item_id": inventory_item_id,
                    "product_name": product_name,
                    "source_type": source_type,
                    "delivery_status": delivery_status,
                    "warehouse_status_note": item.get("warehouse_status_note") or item.get("warehouse"),
                    "preorder_note": item.get("preorder_note") or item.get("preorder"),
                    "quantity_required": item.get("quantity_required") or 1,
                    "notes": item.get("notes"),
                },
            )

        return self.write_json({"ok": True})

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return None

    def write_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return
