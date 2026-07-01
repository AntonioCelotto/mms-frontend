from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import clean_text, parse_optional_positive_int, parse_positive_int, read_json_body, write_json
from _supabase import patch_rows


def parse_optional_hours(value):
    if value in (None, ""):
        return None
    try:
        parsed = float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


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
        estimated_hours = parse_optional_hours(payload.get("estimated_hours"))
        has_assignee_update = "assigned_user_id" in payload or "external_supplier_name" in payload

        if assigned_user_id is not None:
            external_supplier_name = None

        if has_assignee_update and assigned_user_id is None and external_supplier_name is None:
            return write_json(self, {"error": "Seleziona un dipendente o un nominativo esterno"}, HTTPStatus.BAD_REQUEST)

        update_payload = {}
        if "planned_date" in payload:
            update_payload["planned_date"] = clean_text(payload.get("planned_date")) or None
        if "calendar_day_label" in payload:
            update_payload["calendar_day_label"] = clean_text(payload.get("calendar_day_label")) or None
        if "notes" in payload:
            update_payload["notes"] = clean_text(payload.get("notes")) or None
        if has_assignee_update:
            update_payload["assigned_user_id"] = assigned_user_id
            update_payload["external_supplier_name"] = external_supplier_name
        if estimated_hours is not None:
            update_payload["estimated_hours"] = estimated_hours

        if not any(value is not None for value in update_payload.values()):
            return write_json(self, {"error": "Nessun dato da aggiornare"}, HTTPStatus.BAD_REQUEST)

        try:
            rows = patch_rows(
                "order_tasks",
                filters={"id": f"eq.{task_id}"},
                payload=update_payload,
            )
        except RuntimeError as error:
            return write_json(self, {"error": "Assegnazione non riuscita", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        if not rows:
            return write_json(self, {"error": "Task non trovato"}, HTTPStatus.NOT_FOUND)
        return write_json(self, rows[0])

    def log_message(self, format, *args):
        return
