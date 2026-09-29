from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import require_access, write_json
from _supabase import supabase_request


def marker(table):
    # Two tiny reads detect a new row even when updated_at is not populated.
    latest_change = supabase_request(
        f"/rest/v1/{table}", query={"select": "id,updated_at", "order": "updated_at.desc.nullslast", "limit": 1}
    ) or []
    latest_id = supabase_request(
        f"/rest/v1/{table}", query={"select": "id", "order": "id.desc", "limit": 1}
    ) or []
    return {
        "updated": latest_change[0].get("updated_at") if latest_change else None,
        "id": latest_id[0].get("id") if latest_id else None,
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        profile = require_access(self, {"admin", "commerce", "operator"})
        if not profile:
            return
        try:
            result = {"orders": marker("orders"), "tasks": marker("order_tasks")}
            if profile.get("access_profile") in {"admin", "commerce"}:
                result["inventory"] = marker("inventory_items")
                result["quotes"] = marker("quotes")
        except RuntimeError:
            return write_json(self, {"error": "Sincronizzazione temporaneamente non disponibile"}, HTTPStatus.SERVICE_UNAVAILABLE)
        return write_json(self, result)

    def log_message(self, format, *args):
        return
