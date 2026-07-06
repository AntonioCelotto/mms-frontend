from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import parse_positive_int, read_json_body, write_json, write_options
from _supabase import fetch_table, resolve_order, supabase_request


def numeric(value, default=0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def release_order_inventory(order_id):
    materials = fetch_table(
        "order_materials",
        select="inventory_item_id,reserved_quantity",
        filters={"order_id": f"eq.{order_id}"},
    )
    for material in materials:
        item_id = parse_positive_int(material.get("inventory_item_id"))
        reserved = numeric(material.get("reserved_quantity"), 0)
        if not item_id or reserved <= 0:
            continue
        rows = fetch_table("inventory_items", select="id,reserved_quantity", filters={"id": f"eq.{item_id}"})
        if not rows:
            continue
        next_reserved = max(numeric(rows[0].get("reserved_quantity"), 0) - reserved, 0)
        supabase_request(
            "/rest/v1/inventory_items",
            method="PATCH",
            query={"id": f"eq.{item_id}"},
            payload={"reserved_quantity": next_reserved},
            prefer="return=minimal",
        )


def delete_order(payload):
    order_ref = parse_positive_int(payload.get("order_id") or payload.get("id"))
    if not order_ref:
        return {"error": "Ordine non valido"}, HTTPStatus.BAD_REQUEST

    order = resolve_order(order_ref)
    if not order:
        return {"error": "Ordine non trovato"}, HTTPStatus.NOT_FOUND

    release_order_inventory(order["id"])
    deleted = supabase_request(
        "/rest/v1/orders",
        method="DELETE",
        query={"id": f"eq.{order['id']}", "select": "id,order_number"},
        prefer="return=representation",
    )
    if not deleted:
        return {"error": "Ordine non eliminato"}, HTTPStatus.INTERNAL_SERVER_ERROR
    return {"ok": True, "entity": "order", "deleted": deleted[0]}, HTTPStatus.OK


def delete_client(payload):
    client_id = parse_positive_int(payload.get("client_id") or payload.get("id"))
    if not client_id:
        return {"error": "Cliente non valido"}, HTTPStatus.BAD_REQUEST

    client_rows = fetch_table("clients", select="id,name", filters={"id": f"eq.{client_id}"})
    if not client_rows:
        return {"error": "Cliente non trovato"}, HTTPStatus.NOT_FOUND

    linked_orders = fetch_table("orders", select="id,order_number", filters={"client_id": f"eq.{client_id}"})
    if linked_orders:
        return {
            "error": "Cliente con ordini collegati",
            "detail": "Elimina prima gli ordini collegati, poi il cliente.",
            "orders": linked_orders,
        }, HTTPStatus.CONFLICT

    deleted = supabase_request(
        "/rest/v1/clients",
        method="DELETE",
        query={"id": f"eq.{client_id}", "select": "id,name"},
        prefer="return=representation",
    )
    if not deleted:
        return {"error": "Cliente non eliminato"}, HTTPStatus.INTERNAL_SERVER_ERROR
    return {"ok": True, "entity": "client", "deleted": deleted[0]}, HTTPStatus.OK


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        return write_options(self)

    def do_POST(self):
        payload = read_json_body(self)
        if payload is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        entity = str(payload.get("entity") or "").strip().lower()
        try:
            if entity == "order":
                body, status = delete_order(payload)
            elif entity == "client":
                body, status = delete_client(payload)
            else:
                body, status = {"error": "Tipo eliminazione non valido"}, HTTPStatus.BAD_REQUEST
        except RuntimeError as error:
            body, status = {"error": "Eliminazione non riuscita", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR

        return write_json(self, body, status)

    def log_message(self, format, *args):
        return
