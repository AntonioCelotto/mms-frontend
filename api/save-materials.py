from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import clean_text, normalize_choice, parse_positive_int, read_json_body, write_json
from _supabase import fetch_table, resolve_order, supabase_request


ALLOWED_SOURCE_TYPES = {"mms", "cliente"}
ALLOWED_DELIVERY_STATUSES = {"consegnato", "non_consegnato"}


def normalize_material(item):
    product_name = clean_text(item.get("product_name") or item.get("material"))
    if not product_name:
        return None

    source_type = normalize_choice(item.get("source_type") or item.get("source"), ALLOWED_SOURCE_TYPES, "cliente")
    delivery_status = normalize_choice(
        item.get("delivery_status") or item.get("delivery"),
        ALLOWED_DELIVERY_STATUSES,
        "non_consegnato",
    )
    return {
        "product_name": product_name,
        "material": product_name,
        "source_type": source_type,
        "source": source_type,
        "delivery_status": delivery_status,
        "delivery": delivery_status,
        "warehouse_status_note": clean_text(item.get("warehouse_status_note") or item.get("warehouse")) or None,
        "warehouse": clean_text(item.get("warehouse_status_note") or item.get("warehouse")) or None,
        "preorder_note": clean_text(item.get("preorder_note") or item.get("preorder")) or None,
        "preorder": clean_text(item.get("preorder_note") or item.get("preorder")) or None,
        "quantity_required": clean_text(item.get("quantity_required")) or "1",
        "inventory_sku": clean_text(item.get("inventory_sku")) or None,
        "notes": clean_text(item.get("notes")) or None,
    }


def resolve_order_for_materials(payload):
    order_db_id = parse_positive_int(payload.get("order_db_id") or payload.get("db_id"))
    if order_db_id:
        rows = fetch_table("orders", filters={"id": f"eq.{order_db_id}"})
        if rows:
            return rows[0]

    order_ref = parse_positive_int(payload.get("order_id"))
    if not order_ref:
        return None

    rows = fetch_table("orders", filters={"order_number": f"eq.{order_ref}"})
    if rows:
        return rows[0]
    return resolve_order(order_ref)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        payload = read_json_body(self)
        if payload is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        materials = payload.get("materials", [])
        if not isinstance(materials, list):
            return write_json(self, {"error": "Materiali non validi"}, HTTPStatus.BAD_REQUEST)

        order = resolve_order_for_materials(payload)
        if not order:
            return write_json(self, {"error": "Ordine non trovato"}, HTTPStatus.NOT_FOUND)

        normalized = []
        for item in materials:
            if not isinstance(item, dict):
                continue
            material = normalize_material(item)
            if material:
                normalized.append(material)

        try:
            saved = supabase_request(
                "/rest/v1/rpc/replace_order_materials_atomic",
                method="POST",
                payload={
                    "p_order_id": order["id"],
                    "p_materials": normalized,
                },
            )
        except RuntimeError as error:
            return write_json(
                self,
                {"error": "Salvataggio materiali non riuscito", "detail": str(error)},
                HTTPStatus.INTERNAL_SERVER_ERROR,
            )

        return write_json(self, {"ok": True, "saved": int(saved or 0), "order_db_id": order["id"]})

    def log_message(self, format, *args):
        return
