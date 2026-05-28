from __future__ import annotations

import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _supabase import insert_rows, resolve_order


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        payload = self.read_json_body()
        if payload is None:
            return self.write_json({"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        order = resolve_order(int(payload.get("order_id") or 0))
        if not order:
            return self.write_json({"error": "Ordine non trovato"}, HTTPStatus.NOT_FOUND)

        created = insert_rows(
            "payments",
            {
                "order_id": order["id"],
                "payment_type": payload.get("payment_type") or "saldo",
                "amount": payload.get("amount"),
                "due_date": payload.get("due_date"),
                "paid_date": payload.get("paid_date"),
                "status": payload.get("status") or "pagato",
                "notes": payload.get("notes"),
            },
        )
        return self.write_json(created[0] if created else {"ok": True}, HTTPStatus.CREATED)

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
