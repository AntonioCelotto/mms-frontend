from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import clean_text, parse_positive_int, read_json_body, write_json
from _supabase import patch_rows


class handler(BaseHTTPRequestHandler):
    def do_PATCH(self):
        payload = read_json_body(self)
        if payload is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        client_id = parse_positive_int(payload.get("client_id"))
        if not client_id:
            return write_json(self, {"error": "Cliente non valido"}, HTTPStatus.BAD_REQUEST)

        visibility_enabled = payload.get("visibility_enabled")
        if isinstance(visibility_enabled, str):
            visibility_enabled = visibility_enabled.strip().lower() in {"true", "1", "si", "yes"}
        else:
            visibility_enabled = bool(visibility_enabled)

        try:
            rows = patch_rows(
                "clients",
                filters={"id": f"eq.{client_id}"},
                payload={
                    "email": clean_text(payload.get("email")) or None,
                    "phone": clean_text(payload.get("phone")) or None,
                    "payment_terms": clean_text(payload.get("payment_terms")) or None,
                    "notes": clean_text(payload.get("notes")) or None,
                    "visibility_enabled": visibility_enabled,
                },
            )
        except RuntimeError as error:
            return write_json(self, {"error": "Salvataggio cliente non riuscito", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        if not rows:
            return write_json(self, {"error": "Cliente non trovato"}, HTTPStatus.NOT_FOUND)
        return write_json(self, rows[0])

    def log_message(self, format, *args):
        return
