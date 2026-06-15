from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import parse_positive_int, read_json_body, write_json
from _supabase import delete_rows, fetch_table, patch_rows


class handler(BaseHTTPRequestHandler):
    def do_DELETE(self):
        payload = read_json_body(self)
        if payload is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        user_id = parse_positive_int(payload.get("user_id"))
        if not user_id:
            return write_json(self, {"error": "Account non valido"}, HTTPStatus.BAD_REQUEST)

        try:
            assigned_tasks = fetch_table("order_tasks", select="id", filters={"assigned_user_id": f"eq.{user_id}"})
            if assigned_tasks:
                rows = patch_rows("users", filters={"id": f"eq.{user_id}"}, payload={"is_active": False})
                if not rows:
                    return write_json(self, {"error": "Account non trovato"}, HTTPStatus.NOT_FOUND)
                return write_json(
                    self,
                    {
                        "mode": "deactivated",
                        "message": "Account disattivato per mantenere lo storico dei task assegnati",
                        "account": rows[0],
                    },
                )

            delete_rows("user_skills", filters={"user_id": f"eq.{user_id}"})
            delete_rows("users", filters={"id": f"eq.{user_id}"})
        except RuntimeError as error:
            return write_json(self, {"error": "Eliminazione account non riuscita", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        return write_json(self, {"mode": "deleted", "message": "Account eliminato"})

    def log_message(self, format, *args):
        return
