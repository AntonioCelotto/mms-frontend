from __future__ import annotations

from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import read_json_body, require_access, write_json, write_options
from _supabase import fetch_table, patch_rows


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        profile = require_access(self, {"admin", "commerce"})
        if not profile:
            return
        payload = read_json_body(self)
        try:
            if not str(payload["attachment_id"]).isdigit() or not str(payload["order_id"]).isdigit():
                raise ValueError()
            attachment_id = int(payload["attachment_id"])
            order_id = int(payload["order_id"])
            action = payload["action"]
            if attachment_id <= 0 or order_id <= 0 or action not in {"delete", "restore"}:
                raise ValueError()
        except (TypeError, KeyError, ValueError):
            return write_json(self, {"error": "Foto o operazione non valida"}, HTTPStatus.BAD_REQUEST)

        # Use exact DB IDs: never resolve an attachment against another order
        # whose display number happens to match the requested database ID.
        filters = {"id": f"eq.{attachment_id}", "order_id": f"eq.{order_id}"}
        try:
            rows = fetch_table("attachments", filters=filters)
            if not rows:
                return write_json(self, {"error": "Foto non trovata in questo ordine"}, HTTPStatus.NOT_FOUND)
            row = rows[0]
            if row.get("file_type") != "foto" and not str(row.get("mime_type") or "").startswith("image/"):
                return write_json(self, {"error": "Questa operazione riguarda soltanto le foto"}, HTTPStatus.BAD_REQUEST)
            now = datetime.now(timezone.utc).isoformat()
            if action == "delete" and not row.get("deleted_at"):
                updates = {"deleted_at": now, "deleted_by_user_id": profile["id"]}
                filters["deleted_at"] = "is.null"
            elif action == "restore" and row.get("deleted_at"):
                if payload.get("expected_deleted_at") != row["deleted_at"]:
                    return write_json(self, {"error": "La foto è stata modificata da un altro utente. Aggiorna l'elenco e riprova."}, HTTPStatus.CONFLICT)
                updates = {"deleted_at": None, "restored_at": now, "restored_by_user_id": profile["id"]}
                filters["deleted_at"] = f"eq.{row['deleted_at']}"
            else:
                updates = None  # Idempotent retries must not change timestamps.
            if updates:
                changed = patch_rows("attachments", filters=filters, payload=updates)
                if not changed:
                    return write_json(self, {"error": "La foto è stata modificata da un altro utente. Aggiorna l'elenco e riprova."}, HTTPStatus.CONFLICT)
                row = changed[0]
            active = fetch_table("attachments", select="id", filters={"order_id": f"eq.{order_id}", "deleted_at": "is.null"})
        except RuntimeError:
            return write_json(self, {"error": "Aggiornamento foto temporaneamente non disponibile. Riapri l'ordine per verificarne lo stato."}, HTTPStatus.SERVICE_UNAVAILABLE)
        return write_json(self, {"attachment": {"id": row["id"], "name": row.get("file_name") or "Foto",
                                                "deleted_at": row.get("deleted_at")}, "active_count": len(active)})

    def do_OPTIONS(self):
        return write_options(self)

    def log_message(self, format, *args):
        return
