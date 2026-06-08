from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import clean_text, normalize_choice, parse_optional_number, parse_positive_int, read_json_body, write_json
from _supabase import patch_rows


ALLOWED_STATUSES = {"da_avviare", "in_corso", "in_attesa", "completato"}


class handler(BaseHTTPRequestHandler):
    def do_PATCH(self):
        payload = read_json_body(self)
        if payload is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        task_id = parse_positive_int(payload.get("task_id"))
        if not task_id:
            return write_json(self, {"error": "Task non valido"}, HTTPStatus.BAD_REQUEST)

        status = normalize_choice(payload.get("status"), ALLOWED_STATUSES)
        if not status:
            return write_json(self, {"error": "Stato task non valido"}, HTTPStatus.BAD_REQUEST)

        actual_hours = parse_optional_number(payload.get("actual_hours"))
        if payload.get("actual_hours") not in (None, "") and actual_hours is None:
            return write_json(self, {"error": "Ore effettive non valide"}, HTTPStatus.BAD_REQUEST)

        try:
            rows = patch_rows(
                "order_tasks",
                filters={"id": f"eq.{task_id}"},
                payload={
                    "status": status,
                    "actual_hours": actual_hours,
                    "notes": clean_text(payload.get("notes")) or None,
                },
            )
        except RuntimeError as error:
            return write_json(self, {"error": "Aggiornamento task non riuscito", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        if not rows:
            return write_json(self, {"error": "Task non trovato"}, HTTPStatus.NOT_FOUND)
        return write_json(self, rows[0])

    def log_message(self, format, *args):
        return
