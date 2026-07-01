from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import clean_text, read_json_body, write_json, write_options
from _supabase import fetch_table, supabase_request


WORKLOG_SELECT = "task_id,order_id,status,elapsed_ms,started_at,finished_at,pauses,payload,created_at,updated_at"


def optional_int(value):
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def positive_number(value, default=0):
    if value in (None, ""):
        return default
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        return default
    return max(0, parsed)


def iso_or_none(value):
    cleaned = clean_text(value)
    return cleaned or None


def normalize_worklog(raw):
    payload = raw if isinstance(raw, dict) else {}
    task_id = clean_text(payload.get("task_id") or payload.get("taskId"))
    if not task_id:
        raise ValueError("Task lavorazione mancante")

    return {
        "task_id": task_id,
        "order_id": optional_int(payload.get("order_id") or payload.get("orderId")),
        "status": clean_text(payload.get("status")) or "Da avviare",
        "elapsed_ms": positive_number(payload.get("elapsed_ms") or payload.get("elapsedMs")),
        "started_at": iso_or_none(payload.get("started_at") or payload.get("startedAt")),
        "finished_at": iso_or_none(payload.get("finished_at") or payload.get("finishedAt")),
        "pauses": positive_number(payload.get("pauses")),
        "payload": payload.get("payload") if isinstance(payload.get("payload"), dict) else {},
    }


def shape_worklog(row):
    return {
        "taskId": row.get("task_id"),
        "orderId": row.get("order_id"),
        "status": row.get("status") or "Da avviare",
        "elapsedMs": row.get("elapsed_ms") or 0,
        "startedAt": row.get("started_at") or "",
        "finishedAt": row.get("finished_at") or "",
        "pauses": row.get("pauses") or 0,
        "payload": row.get("payload") if isinstance(row.get("payload"), dict) else {},
        "createdAt": row.get("created_at") or "",
        "updatedAt": row.get("updated_at") or "",
    }


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        return write_options(self)

    def do_GET(self):
        try:
            rows = fetch_table("calendar_worklogs", select=WORKLOG_SELECT, order="updated_at.desc")
        except RuntimeError as error:
            return write_json(self, {"error": "Registro lavorazioni non disponibile", "detail": str(error)}, HTTPStatus.SERVICE_UNAVAILABLE)
        return write_json(self, {"worklogs": [shape_worklog(row) for row in rows]})

    def do_POST(self):
        body = read_json_body(self)
        if body is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        raw = body.get("worklog") if isinstance(body.get("worklog"), dict) else body
        try:
            row_payload = normalize_worklog(raw)
            rows = supabase_request(
                "/rest/v1/calendar_worklogs",
                method="POST",
                query={"on_conflict": "task_id", "select": WORKLOG_SELECT},
                payload=row_payload,
                prefer="resolution=merge-duplicates,return=representation",
            )
        except ValueError as error:
            return write_json(self, {"error": str(error)}, HTTPStatus.BAD_REQUEST)
        except RuntimeError as error:
            return write_json(self, {"error": "Lavorazione non salvata", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        row = rows[0] if isinstance(rows, list) and rows else None
        return write_json(self, {"worklog": shape_worklog(row) if row else raw}, HTTPStatus.CREATED)

    def log_message(self, format, *args):
        return
