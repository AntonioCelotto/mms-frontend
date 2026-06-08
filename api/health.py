from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import write_json, write_options
from _supabase import fetch_table


HEALTH_TABLES = [
    "clients",
    "departments",
    "users",
    "orders",
    "order_tasks",
    "order_materials",
    "payments",
]


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        return write_options(self)

    def do_GET(self):
        checks = {}
        try:
            for table in HEALTH_TABLES:
                rows = fetch_table(table, select="id")
                checks[table] = len(rows)
        except RuntimeError as error:
            return write_json(
                self,
                {
                    "ok": False,
                    "service": "mms-frontend-api",
                    "database": "unavailable",
                    "error": str(error),
                },
                HTTPStatus.SERVICE_UNAVAILABLE,
            )

        return write_json(
            self,
            {
                "ok": True,
                "service": "mms-frontend-api",
                "database": "available",
                "tables": checks,
            },
        )

    def log_message(self, format, *args):
        return
