from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import clean_text, normalize_choice, parse_optional_number, parse_positive_int, read_json_body, write_json
from _supabase import delete_rows, fetch_table, insert_rows, resolve_order


ALLOWED_SOURCE_TYPES = {"mms", "cliente"}
ALLOWED_DELIVERY_STATUSES = {"consegnato", "non_consegnato"}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        payload = read_json_body(self)
        if payload is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        order_ref = parse_positive_int(payload.get("order_id"))
        if not order_ref:
            return write_json(self, {"error": "Ordine non valido"}, HTTPStatus.BAD_REQUEST)

        materials = payload.get("materials", [])
        if not isinstance(materials, list):
            return write_json(self, {"error": "Materiali non validi"}, HTTPStatus.BAD_REQUEST)

        order = resolve_order(order_ref)
        if not order:
            return write_json(self, {"error": "Ordine non trovato"}, HTTPStatus.NOT_FOUND)

        try:
            delete_rows("order_materials", filters={"order_id": f"eq.{order['id']}"})
            saved_count = 0
            for item in materials:
                if not isinstance(item, dict):
                    continue
                product_name = clean_text(item.get("product_name") or item.get("material"))
                if not product_name:
                    continue

                source_type = normalize_choice(item.get("source_type") or item.get("source"), ALLOWED_SOURCE_TYPES, "cliente")
                delivery_status = normalize_choice(
                    item.get("delivery_status") or item.get("delivery"),
                    ALLOWED_DELIVERY_STATUSES,
                    "non_consegnato",
                )
                quantity_required = parse_optional_number(item.get("quantity_required")) or 1
                inventory_item_id = None
                inventory_sku = clean_text(item.get("inventory_sku"))
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
                        "warehouse_status_note": clean_text(item.get("warehouse_status_note") or item.get("warehouse")) or None,
                        "preorder_note": clean_text(item.get("preorder_note") or item.get("preorder")) or None,
                        "quantity_required": quantity_required,
                        "notes": clean_text(item.get("notes")) or None,
                    },
                )
                saved_count += 1
        except RuntimeError as error:
            return write_json(self, {"error": "Salvataggio materiali non riuscito", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        return write_json(self, {"ok": True, "saved": saved_count})

    def log_message(self, format, *args):
        return
