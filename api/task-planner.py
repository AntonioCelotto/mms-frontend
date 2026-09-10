from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import read_json_body, write_json, write_options
from _task_planner import reschedule_tasks
from accounts import require_admin


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        return write_options(self)

    def do_GET(self):
        if not require_admin(self):
            return write_json(self, {"error": "Accesso amministratore richiesto"}, HTTPStatus.FORBIDDEN)
        try:
            return write_json(self, reschedule_tasks(apply=False))
        except RuntimeError as error:
            return write_json(self, {"error": "Pianificazione non disponibile", "detail": str(error)}, HTTPStatus.SERVICE_UNAVAILABLE)

    def do_POST(self):
        if not require_admin(self):
            return write_json(self, {"error": "Accesso amministratore richiesto"}, HTTPStatus.FORBIDDEN)
        body = read_json_body(self)
        if body is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)
        try:
            return write_json(self, reschedule_tasks(apply=body.get("apply") is True))
        except RuntimeError as error:
            return write_json(self, {"error": "Pianificazione non aggiornata", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def log_message(self, format, *args):
        return
