from __future__ import annotations

from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import require_access, write_json
from _supabase import fetch_table


PAYMENT_SELECT = (
    "id,order_id,payment_type,amount,due_date,paid_date,status,notes,created_at,"
    "order:orders(id,order_number,source_quote_number,client:clients(name))"
)


def archive_rows():
    # fetch_table follows every page, including records beyond Supabase's
    # default 1,000-row limit. Related names arrive in the same request.
    rows = fetch_table("payments", select=PAYMENT_SELECT, order="id.desc")
    result = []
    for row in rows:
        order = row.get("order") or {}
        client = order.get("client") or {}
        number = str(order.get("order_number") or "")
        result.append({
            **{key: row.get(key) for key in (
                "id", "order_id", "payment_type", "amount", "due_date", "paid_date", "status", "notes",
            )},
            "display_order_id": int(number) if number.isdigit() else row.get("order_id"),
            "order_number": order.get("source_quote_number") or number or row.get("order_id"),
            "client": client.get("name") or "Cliente da definire",
        })
    return result


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if not require_access(self, {"admin", "commerce"}):
            return
        try:
            rows = archive_rows()
        except RuntimeError:
            return write_json(self, {"error": "Elenco pagamenti temporaneamente non disponibile"}, HTTPStatus.SERVICE_UNAVAILABLE)
        return write_json(self, {
            "payments": rows,
            "loaded_at": datetime.now(timezone.utc).isoformat(),
        })

    def log_message(self, format, *args):
        return
