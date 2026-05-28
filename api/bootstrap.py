from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler
from pathlib import Path


DATA_PATH = Path("data") / "bootstrap.json"


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ("/api/bootstrap", "/api/bootstrap/"):
            self.send_response(404)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(b'{"error":"Not found"}')
            return

        payload = load_bootstrap()
        body = json.dumps(payload, ensure_ascii=True).encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return


def load_bootstrap():
    if not DATA_PATH.exists():
        return {}
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))
