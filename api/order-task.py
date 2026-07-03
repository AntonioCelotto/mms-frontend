from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import clean_text, parse_optional_positive_int, parse_positive_int, read_json_body, write_json, write_options
from _supabase import fetch_table, insert_rows, resolve_order


CORE_PHASES = {"cartamodello", "taglio", "confezione"}


def normalize_phase(value):
    raw = clean_text(value).lower().replace(" ", "_")
    if "cartamodello" in raw:
        return "cartamodello"
    if "taglio" in raw:
        return "taglio"
    if "confezione" in raw:
        return "confezione"
    return raw or "altro"


def normalize_status(value):
    raw = clean_text(value).lower().replace(" ", "_")
    if raw in {"in_corso", "completato", "da_confermare", "stand_by"}:
        return raw
    return "da_avviare"


def parse_hours(value):
    if value in (None, ""):
        return None
    try:
        parsed = float(str(value).replace(",", ".").replace(" h", "").strip())
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def default_department_id(order_id):
    rows = fetch_table("order_tasks", select="department_id", filters={"order_id": f"eq.{order_id}"}, order="id.asc")
    if rows and rows[0].get("department_id"):
        return rows[0]["department_id"]
    departments = fetch_table("departments", select="id", order="id.asc")
    return departments[0]["id"] if departments else None


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        return write_options(self)

    def do_POST(self):
        payload = read_json_body(self)
        if payload is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        order_ref = parse_positive_int(payload.get("order_id") or payload.get("order_ref"))
        if not order_ref:
            return write_json(self, {"error": "Ordine non valido"}, HTTPStatus.BAD_REQUEST)

        try:
            order = resolve_order(order_ref)
        except RuntimeError as error:
            return write_json(self, {"error": "Ordine non verificabile", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)
        if not order:
            return write_json(self, {"error": "Ordine non trovato"}, HTTPStatus.NOT_FOUND)

        task_name = clean_text(payload.get("task_name") or payload.get("name")) or "Nuovo task ordine"
        task_phase = normalize_phase(payload.get("task_phase") or payload.get("phase"))
        department_id = parse_optional_positive_int(payload.get("department_id"))
        assigned_user_id = parse_optional_positive_int(payload.get("assigned_user_id"))
        external_supplier_name = clean_text(payload.get("external_supplier_name")) or None
        if assigned_user_id is not None:
            external_supplier_name = None

        try:
            department_id = department_id or default_department_id(order["id"])
            if not department_id:
                return write_json(self, {"error": "Reparto non disponibile"}, HTTPStatus.BAD_REQUEST)

            created = insert_rows(
                "order_tasks",
                {
                    "order_id": order["id"],
                    "department_id": department_id,
                    "assigned_user_id": assigned_user_id,
                    "external_supplier_name": external_supplier_name,
                    "task_name": task_name,
                    "task_phase": task_phase,
                    "status": normalize_status(payload.get("status") or payload.get("state")),
                    "planned_date": clean_text(payload.get("planned_date") or payload.get("time")) or None,
                    "estimated_hours": parse_hours(payload.get("estimated_hours") or payload.get("hours")),
                    "notes": clean_text(payload.get("notes")) or None,
                },
            )
        except RuntimeError as error:
            return write_json(self, {"error": "Task non salvato", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        return write_json(self, created[0] if created else {"ok": True}, HTTPStatus.CREATED)

    def log_message(self, format, *args):
        return
