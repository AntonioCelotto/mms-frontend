from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import clean_text, normalize_choice, read_json_body, write_json
from _supabase import ensure_client, get_department_by_name, infer_production_mode, insert_rows, next_order_number


ALLOWED_PRIORITIES = {"standard", "express"}


def require_created_row(rows, label):
    if not isinstance(rows, list) or not rows:
        raise RuntimeError(f"{label}: Supabase non ha restituito il record creato")
    return rows[0]


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

            client = ensure_client(client_name)
            order_number = next_order_number()
            department = get_department_by_name(department_name)
            created = insert_rows(
                "orders",
                {
                    "order_number": order_number,
                    "client_id": client["id"],
                    "category": category,
                    "production_mode": infer_production_mode(department_name),
                    "priority": priority_value,
                    "status": "da_avviare",
                    "order_date": clean_text(payload.get("order_date")) or None,
                    "estimated_delivery_date": clean_text(payload.get("estimated_delivery_date")) or None,
                    "warehouse_linked": bool(payload.get("warehouse_linked")),
                    "client_visibility_note": clean_text(payload.get("client_visibility_note")) or None,
                    "internal_notes": clean_text(payload.get("note")) or None,
                },
            )
            order = require_created_row(created, "Ordine")

            phase_map = {
                "Sartoria interna": ["cartamodello", "taglio", "confezione"],
                "Sartoria esterna": ["confezione", "controllo_finale"],
                "Commercio": ["materiale", "controllo_finale"],
            }
            for phase in phase_map.get(department["name"], ["confezione"]):
                insert_rows(
                    "order_tasks",
                    {
                        "order_id": order["id"],
                        "department_id": department["id"],
                        "task_name": f"{phase.replace('_', ' ').title()} ordine #{order_number}",
                        "task_phase": phase,
                        "status": "da_avviare",
                        "planned_date": clean_text(payload.get("estimated_delivery_date")) or None,
                        "estimated_hours": 1.0 if phase in {"materiale", "controllo_finale"} else 2.0 if phase == "taglio" else 3.0,
                        "calendar_day_label": None,
                    },
                )

            deposit_status = clean_text(payload.get("deposit_status"))
            if deposit_status:
                insert_rows(
                    "payments",
                    {
                        "order_id": order["id"],
                        "payment_type": "acconto",
                        "due_date": clean_text(payload.get("estimated_delivery_date")) or None,
                        "status": "pagato" if deposit_status.lower() == "ricevuto" else "da_pagare",
                        "notes": f"Stato acconto iniziale: {deposit_status}",
                    },
                )
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

        return write_json(self, {"order": {"id": int(order_number), "db_id": order["id"]}}, HTTPStatus.CREATED)

    def log_message(self, format, *args):
        return
