from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import clean_text, normalize_choice, parse_optional_number, parse_positive_int, read_json_body, write_json
from _supabase import insert_rows, resolve_order


ALLOWED_PAYMENT_TYPES = {"acconto", "saldo", "scadenza"}
ALLOWED_PAYMENT_STATUSES = {"da_pagare", "pagato", "scaduto", "autorizzato"}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        payload = read_json_body(self)
        if payload is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        order_ref = parse_positive_int(payload.get("order_id"))
        if not order_ref:
            return write_json(self, {"error": "Ordine non valido"}, HTTPStatus.BAD_REQUEST)

        order = resolve_order(order_ref)
        if not order:
            return write_json(self, {"error": "Ordine non trovato"}, HTTPStatus.NOT_FOUND)

        payment_type = normalize_choice(payload.get("payment_type"), ALLOWED_PAYMENT_TYPES, "saldo")
        status = normalize_choice(payload.get("status"), ALLOWED_PAYMENT_STATUSES, "pagato")
        amount = parse_optional_number(payload.get("amount"))
        if payload.get("amount") not in (None, "") and amount is None:
            return write_json(self, {"error": "Importo non valido"}, HTTPStatus.BAD_REQUEST)

        try:
            created = insert_rows(
                "payments",
                {
                    "order_id": order["id"],
                    "payment_type": payment_type,
                    "amount": amount,
                    "due_date": clean_text(payload.get("due_date")) or None,
                    "paid_date": clean_text(payload.get("paid_date")) or None,
                    "status": status,
                    "notes": clean_text(payload.get("notes")) or None,
                },
            )
        except RuntimeError as error:
            return write_json(self, {"error": "Registrazione pagamento non riuscita", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        return write_json(self, created[0] if created else {"ok": True}, HTTPStatus.CREATED)

    def log_message(self, format, *args):
        return
