from __future__ import annotations

import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _supabase import ensure_client, get_department_by_name, infer_production_mode, insert_rows, next_order_number


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        payload = self.read_json_body()
        if payload is None:
            return self.write_json({"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        required = ["client", "category", "priority", "department"]
        missing = [field for field in required if not str(payload.get(field, "")).strip()]
        if missing:
            return self.write_json({"error": f"Campi obbligatori mancanti: {', '.join(missing)}"}, HTTPStatus.BAD_REQUEST)

        client = ensure_client(payload["client"].strip())
        order_number = next_order_number()
        department = get_department_by_name(payload.get("department") or "Sartoria interna")
        priority_value = "express" if (payload.get("priority") or "").strip().lower() == "express" else "standard"

        created = insert_rows(
            "orders",
            {
                "order_number": order_number,
                "client_id": client["id"],
                "category": payload.get("category") or "Sartoria",
                "production_mode": infer_production_mode(payload.get("department") or ""),
                "priority": priority_value,
                "status": "da_avviare",
                "order_date": payload.get("order_date"),
                "estimated_delivery_date": payload.get("estimated_delivery_date"),
                "warehouse_linked": bool(payload.get("warehouse_linked")),
                "client_visibility_note": payload.get("client_visibility_note"),
                "internal_notes": payload.get("note"),
            },
        )
        order = created[0]

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
                    "planned_date": payload.get("estimated_delivery_date"),
                    "estimated_hours": 1.0 if phase in {"materiale", "controllo_finale"} else 2.0 if phase == "taglio" else 3.0,
                    "calendar_day_label": None,
                },
            )

        deposit_status = payload.get("deposit_status")
        if deposit_status:
            insert_rows(
                "payments",
                {
                    "order_id": order["id"],
                    "payment_type": "acconto",
                    "due_date": payload.get("estimated_delivery_date"),
                    "status": "pagato" if str(deposit_status).strip().lower() == "ricevuto" else "da_pagare",
                    "notes": f"Stato acconto iniziale: {deposit_status}",
                },
            )

        return self.write_json({"order": {"id": int(order_number), "db_id": order["id"]}}, HTTPStatus.CREATED)

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return None

    def write_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return
