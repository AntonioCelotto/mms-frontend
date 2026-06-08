from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import write_json
from _supabase import build_bootstrap


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ("/api/bootstrap", "/api/bootstrap/"):
            return write_json(self, {"error": "Not found"}, HTTPStatus.NOT_FOUND)

        try:
            payload = build_bootstrap()
        except RuntimeError as error:
            return write_json(
                self,
                {"error": "Bootstrap non disponibile", "detail": str(error)},
                HTTPStatus.SERVICE_UNAVAILABLE,
            )

        return write_json(self, payload)

    def log_message(self, format, *args):
        return
