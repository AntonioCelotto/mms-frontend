from __future__ import annotations

import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _supabase import patch_rows


class handler(BaseHTTPRequestHandler):
    def do_PATCH(self):
        payload = self.read_json_body()
        if payload is None:
            return self.write_json({"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        client_id = int(payload.get("client_id") or 0)
        rows = patch_rows(
            "clients",
            filters={"id": f"eq.{client_id}"},
            payload={
                "email": payload.get("email"),
                "phone": payload.get("phone"),
                "payment_terms": payload.get("payment_terms"),
                "notes": payload.get("notes"),
                "visibility_enabled": bool(payload.get("visibility_enabled")),
            },
        )
        return self.write_json(rows[0] if rows else {"ok": True})

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
