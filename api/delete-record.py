from __future__ import annotations

import json
import socket
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from _api import clean_text, parse_positive_int, read_json_body, write_json, write_options
from _supabase import SUPABASE_KEY, SUPABASE_TIMEOUT_SECONDS, SUPABASE_URL, fetch_table, supabase_request


def numeric(value, default=0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def verify_auth_user(handler):
    header = clean_text(handler.headers.get("Authorization"))
    if not header.lower().startswith("bearer "):
        return None
    token = header.split(" ", 1)[1].strip()
    if not token:
        return None
    request = Request(
        f"{SUPABASE_URL}/auth/v1/user",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="GET",
    )
    try:
        with urlopen(request, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else None
    except (HTTPError, URLError, TimeoutError, socket.timeout, json.JSONDecodeError):
        return None


def current_profile(handler):
    auth_user = verify_auth_user(handler)
    auth_user_id = clean_text((auth_user or {}).get("id"))
    email = clean_text((auth_user or {}).get("email")).lower()
    if not auth_user_id and not email:
        return None
    if auth_user_id:
        rows = fetch_table("users", select="id,email,role,is_active", filters={"auth_user_id": f"eq.{auth_user_id}"})
        if rows:
            return rows[0]
    if email:
        rows = fetch_table("users", select="id,email,role,is_active", filters={"email": f"eq.{email}"})
        if rows:
            return rows[0]
    return None


def require_admin(handler):
    profile = current_profile(handler)
    return bool(profile and profile.get("is_active") is not False and profile.get("role") == "admin")


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


def fetch_order_by_id(order_id):
    if not order_id:
        return None
    rows = fetch_table("orders", select="id,order_number", filters={"id": f"eq.{order_id}"})
    return rows[0] if rows else None


def fetch_order_by_number(order_number):
    order_number = clean_text(order_number)
    if not order_number:
        return None
    rows = fetch_table("orders", select="id,order_number", filters={"order_number": f"eq.{order_number}"})
    return rows[0] if rows else None


def resolve_order_for_delete(payload):
    explicit_db_id = parse_positive_int(payload.get("order_db_id") or payload.get("db_id") or payload.get("internal_id"))
    if explicit_db_id:
        return fetch_order_by_id(explicit_db_id)

    explicit_number = clean_text(payload.get("order_number") or payload.get("display_order_id"))
    if explicit_number:
        return fetch_order_by_number(explicit_number)

    legacy_ref = parse_positive_int(payload.get("order_id") or payload.get("id"))
    if legacy_ref:
        return fetch_order_by_id(legacy_ref)

    return None


def delete_order(payload):
    order = resolve_order_for_delete(payload)
    if not order:
        return {"error": "Ordine non valido o non trovato"}, HTTPStatus.BAD_REQUEST

    deleted = supabase_request(
        "/rest/v1/rpc/delete_order_safely",
        method="POST",
        payload={"p_order_ref": parse_positive_int(order.get("id"))},
    )
    return deleted, HTTPStatus.OK


def delete_client(payload):
    client_id = parse_positive_int(payload.get("client_id") or payload.get("id"))
    if not client_id:
        return {"error": "Cliente non valido"}, HTTPStatus.BAD_REQUEST

    client_rows = fetch_table("clients", select="id,name", filters={"id": f"eq.{client_id}"})
    if not client_rows:
        return {"error": "Cliente non trovato"}, HTTPStatus.NOT_FOUND

    linked_orders = fetch_table("orders", select="id,order_number", filters={"client_id": f"eq.{client_id}"})
    if linked_orders:
        order_numbers = [row.get("order_number") or row.get("id") for row in linked_orders]
        preview = ", ".join(f"#{number}" for number in order_numbers[:8])
        suffix = f" e altri {len(order_numbers) - 8}" if len(order_numbers) > 8 else ""
        return {
            "error": "Cliente con ordini collegati",
            "detail": f"Cliente non eliminato: ha {len(order_numbers)} ordini collegati ({preview}{suffix}). Elimina prima gli ordini collegati, poi il cliente.",
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
        if not require_admin(self):
            return write_json(self, {"error": "Solo un amministratore puo' eliminare clienti e ordini"}, HTTPStatus.FORBIDDEN)

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
