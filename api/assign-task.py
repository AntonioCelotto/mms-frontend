from __future__ import annotations

import math
import re
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import clean_text, parse_optional_positive_int, parse_positive_int, read_json_body, require_access, write_json
from _supabase import fetch_table, patch_rows
try:
    from _task_quantity import quantity_fields
except ModuleNotFoundError:
    from api._task_quantity import quantity_fields


def parse_optional_hours(value):
    if value in (None, ""):
        return None
    try:
        parsed = float(str(value).replace(",", ".").removesuffix(" h").strip())
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) and parsed >= 0 else None


def normalize_phase(value):
    raw = clean_text(value).lower().replace(" ", "_")
    if "cartamodello" in raw:
        return "cartamodello"
    if "taglio" in raw:
        return "taglio"
    if "confezione" in raw:
        return "confezione"
    return raw or None


def normalize_status(value):
    raw = clean_text(value).lower().replace(" ", "_")
    aliases = {"da_confermare": "in_attesa", "stand_by": "in_attesa"}
    raw = aliases.get(raw, raw)
    return raw if raw in {"da_avviare", "in_corso", "in_attesa", "completato"} else None


class handler(BaseHTTPRequestHandler):
    def do_PATCH(self):
        if not require_access(self, {"admin"}):
            return
        payload = read_json_body(self)
        if payload is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        task_id = parse_positive_int(payload.get("task_id"))
        if not task_id:
            return write_json(self, {"error": "Task non valido"}, HTTPStatus.BAD_REQUEST)

        assigned_user_id = parse_optional_positive_int(payload.get("assigned_user_id"))
        external_supplier_name = clean_text(payload.get("external_supplier_name")) or None
        estimated_hours = parse_optional_hours(payload.get("estimated_hours"))
        if "estimated_hours" in payload and payload.get("estimated_hours") not in (None, "") and estimated_hours is None:
            return write_json(self, {"error": "Ore di lavoro non valide"}, HTTPStatus.BAD_REQUEST)
        task_name = clean_text(payload.get("task_name")) or None
        task_phase = normalize_phase(payload.get("task_phase"))
        status = normalize_status(payload.get("status"))
        has_assignee_update = "assigned_user_id" in payload or "external_supplier_name" in payload

        if assigned_user_id is not None:
            external_supplier_name = None

        if has_assignee_update and assigned_user_id is None and external_supplier_name is None:
            return write_json(self, {"error": "Seleziona un dipendente o un nominativo esterno"}, HTTPStatus.BAD_REQUEST)

        queue_assignment = payload.get("only_if_unassigned") is True
        queue_filters = {"id": f"eq.{task_id}"}
        if "only_if_unassigned" in payload and not queue_assignment:
            return write_json(self, {"error": "Modalità assegnazione non valida"}, HTTPStatus.BAD_REQUEST)
        if queue_assignment:
            allowed = {"task_id", "only_if_unassigned", "assigned_user_id", "external_supplier_name", "planned_date", "calendar_day_label"}
            date = clean_text(payload.get("planned_date"))
            if set(payload) - allowed or not has_assignee_update or not re.fullmatch(r"\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?", date):
                return write_json(self, {"error": "Seleziona operatrice e data valide"}, HTTPStatus.BAD_REQUEST)
            try:
                datetime.fromisoformat(date)
            except ValueError:
                return write_json(self, {"error": "Data o ora non valida"}, HTTPStatus.BAD_REQUEST)
            try:
                current_rows = fetch_table("order_tasks", filters={"id": f"eq.{task_id}"})
                if not current_rows:
                    return write_json(self, {"error": "Task non trovata"}, HTTPStatus.NOT_FOUND)
                current = current_rows[0]
                if current.get("assigned_user_id") or clean_text(current.get("external_supplier_name")) or normalize_status(current.get("status")) == "completato":
                    return write_json(self, {"error": "Task già assegnata o completata da un altro utente. Aggiorna l'elenco."}, HTTPStatus.CONFLICT)
                if assigned_user_id:
                    people = fetch_table("users", filters={"id": f"eq.{assigned_user_id}", "is_active": "eq.true"})
                    if not people:
                        return write_json(self, {"error": "Operatrice non attiva o non disponibile"}, HTTPStatus.BAD_REQUEST)
            except RuntimeError as error:
                return write_json(self, {"error": "Verifica assegnazione non disponibile", "detail": str(error)}, HTTPStatus.SERVICE_UNAVAILABLE)
            # Compare-and-set at the database, not just a prior browser check.
            queue_filters["assigned_user_id"] = "is.null"
            queue_filters["external_supplier_name"] = "is.null" if current.get("external_supplier_name") is None else "eq."
            if current.get("updated_at"):
                queue_filters["updated_at"] = f"eq.{current['updated_at']}"
            if current.get("status"):
                queue_filters["status"] = f"eq.{current['status']}"

        try:
            quantity_payload = quantity_fields(payload)
        except ValueError as error:
            return write_json(self, {"error": str(error)}, HTTPStatus.BAD_REQUEST)
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
        update_payload.update(quantity_payload)
        if task_name is not None:
            update_payload["task_name"] = task_name
        if task_phase is not None:
            update_payload["task_phase"] = task_phase
        if status is not None:
            update_payload["status"] = status
        if "article_key" in payload:
            update_payload["article_key"] = clean_text(payload.get("article_key")) or None
        if "article_name" in payload:
            update_payload["article_name"] = clean_text(payload.get("article_name")) or None
        if "due_date" in payload:
            update_payload["due_date"] = clean_text(payload.get("due_date")) or None
        if "sequence_order" in payload:
            update_payload["sequence_order"] = parse_optional_positive_int(payload.get("sequence_order"))
        if task_phase is not None:
            update_payload["sequence_order"] = {"cartamodello": 1, "taglio": 2, "confezione": 3}.get(task_phase, 99)

        if not any(value is not None for value in update_payload.values()):
            return write_json(self, {"error": "Nessun dato da aggiornare"}, HTTPStatus.BAD_REQUEST)

        try:
            rows = patch_rows(
                "order_tasks",
                filters=queue_filters,
                payload=update_payload,
            )
        except RuntimeError as error:
            return write_json(self, {"error": "Assegnazione non riuscita", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        if not rows:
            if queue_assignment:
                return write_json(self, {"error": "Task modificata da un altro utente. Aggiorna l'elenco prima di assegnare."}, HTTPStatus.CONFLICT)
            return write_json(self, {"error": "Task non trovato"}, HTTPStatus.NOT_FOUND)
        return write_json(self, rows[0])

    def log_message(self, format, *args):
        return
