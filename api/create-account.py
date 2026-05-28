from __future__ import annotations

import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _supabase import insert_rows


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        payload = self.read_json_body()
        if payload is None:
            return self.write_json({"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        created = insert_rows(
            "users",
            {
                "first_name": payload.get("first_name"),
                "last_name": payload.get("last_name"),
                "phone": payload.get("phone"),
                "email": payload.get("email"),
                "role": payload.get("role") or "viewer",
                "is_active": True,
            },
        )
        user = created[0]
        for skill in payload.get("skills", []):
            insert_rows("user_skills", {"user_id": user["id"], "skill_name": skill})
        return self.write_json(user, HTTPStatus.CREATED)

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
