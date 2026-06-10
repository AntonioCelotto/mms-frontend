from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import clean_text, normalize_choice, read_json_body, write_json
from _supabase import supabase_request


ALLOWED_PRIORITIES = {"standard", "express"}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            payload = read_json_body(self)
            if payload is None:
                return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

            client_name = clean_text(payload.get("client"))
            category = clean_text(payload.get("category"))
            department_name = clean_text(payload.get("department")) or "Sartoria interna"
            priority_value = normalize_choice(payload.get("priority"), ALLOWED_PRIORITIES, "standard")

            missing = []
            if not client_name:
                missing.append("client")
            if not category:
                missing.append("category")
            if missing:
                return write_json(self, {"error": f"Campi obbligatori mancanti: {', '.join(missing)}"}, HTTPStatus.BAD_REQUEST)

            order = supabase_request(
                "/rest/v1/rpc/create_order_atomic",
                method="POST",
                payload={
                    "p_client_name": client_name,
                    "p_category": category,
                    "p_department_name": department_name,
                    "p_priority": priority_value,
                    "p_order_date": clean_text(payload.get("order_date")) or None,
                    "p_estimated_delivery_date": clean_text(payload.get("estimated_delivery_date")) or None,
                    "p_warehouse_linked": bool(payload.get("warehouse_linked")),
                    "p_client_visibility_note": clean_text(payload.get("client_visibility_note")) or None,
                    "p_internal_notes": clean_text(payload.get("note")) or None,
                    "p_deposit_status": clean_text(payload.get("deposit_status")) or None,
                },
            )
            if not isinstance(order, dict) or not order.get("id") or not order.get("db_id"):
                raise RuntimeError("RPC create_order_atomic non ha restituito un ordine valido")
        except RuntimeError as error:
            detail = str(error)
            status = HTTPStatus.BAD_REQUEST if "Reparto non trovato" in detail else HTTPStatus.INTERNAL_SERVER_ERROR
            return write_json(self, {"error": "Creazione ordine non riuscita", "detail": detail}, status)
        except Exception as error:
            return write_json(
                self,
                {
                    "error": "Creazione ordine non riuscita",
                    "detail": f"{type(error).__name__}: {error}",
                },
                HTTPStatus.INTERNAL_SERVER_ERROR,
            )

        return write_json(self, {"order": {"id": int(order["id"]), "db_id": order["db_id"]}}, HTTPStatus.CREATED)

    def log_message(self, format, *args):
        return
