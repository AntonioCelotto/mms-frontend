from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import clean_text, parse_optional_positive_int, parse_positive_int, read_json_body, write_json
from _supabase import patch_rows


class handler(BaseHTTPRequestHandler):
    def do_PATCH(self):
        payload = read_json_body(self)
        if payload is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        task_id = parse_positive_int(payload.get("task_id"))
        if not task_id:
            return write_json(self, {"error": "Task non valido"}, HTTPStatus.BAD_REQUEST)

        assigned_user_id = parse_optional_positive_int(payload.get("assigned_user_id"))
        external_supplier_name = clean_text(payload.get("external_supplier_name")) or None
        if assigned_user_id is not None:
            external_supplier_name = None

        if assigned_user_id is None and external_supplier_name is None:
            return write_json(self, {"error": "Seleziona un dipendente o un nominativo esterno"}, HTTPStatus.BAD_REQUEST)

        try:
            rows = patch_rows(
                "order_tasks",
                filters={"id": f"eq.{task_id}"},
                payload={
                    "assigned_user_id": assigned_user_id,
                    "external_supplier_name": external_supplier_name,
                    "planned_date": clean_text(payload.get("planned_date")) or None,
                    "calendar_day_label": clean_text(payload.get("calendar_day_label")) or None,
                    "notes": clean_text(payload.get("notes")) or None,
                },
            )
        except RuntimeError as error:
            return write_json(self, {"error": "Assegnazione non riuscita", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        if not rows:
            return write_json(self, {"error": "Task non trovato"}, HTTPStatus.NOT_FOUND)
        return write_json(self, rows[0])

    def log_message(self, format, *args):
        return
