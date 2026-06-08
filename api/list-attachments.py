from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

from _api import write_json, write_options
from _supabase import fetch_table, resolve_order


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        order_ref = (query.get("order_id") or [""])[0]
        try:
            order = resolve_order(int(order_ref))
        except (TypeError, ValueError, RuntimeError):
            order = None
        if not order:
            return write_json(self, {"error": "Ordine non trovato"}, HTTPStatus.NOT_FOUND)

        rows = fetch_table(
            "attachments",
            select="id,order_id,file_type,file_name,file_url,mime_type,file_size,created_at",
            filters={"order_id": f"eq.{order['id']}"},
            order="id.asc",
        )
        attachments = [
            {
                "id": row["id"],
                "order_id": int(order_ref),
                "name": row.get("file_name") or "Allegato",
                "url": row.get("file_url") or "",
                "mime_type": row.get("mime_type") or row.get("file_type") or "",
                "size": row.get("file_size") or 0,
                "created_at": row.get("created_at") or "",
            }
            for row in rows
            if row.get("file_url")
        ]
        return write_json(self, {"attachments": attachments})

    def do_OPTIONS(self):
        return write_options(self)

    def log_message(self, format, *args):
        return
