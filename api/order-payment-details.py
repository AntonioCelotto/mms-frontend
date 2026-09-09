from __future__ import annotations

import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from _api import clean_text, write_json, write_options
from _supabase import SUPABASE_KEY, SUPABASE_URL, fetch_table


def authenticated_admin(handler):
    authorization = clean_text(handler.headers.get("Authorization"))
    if not authorization.lower().startswith("bearer "):
        return False
    token = authorization.split(" ", 1)[1].strip()
    if not token or token == SUPABASE_KEY:
        return False
    request = Request(
        f"{SUPABASE_URL}/auth/v1/user",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {token}"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=5) as response:
            auth_user = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):
        return False
    auth_user_id = clean_text(auth_user.get("id"))
    profiles = fetch_table(
        "users",
        select="role,is_active",
        filters={"auth_user_id": f"eq.{auth_user_id}"},
    )
    return bool(profiles and profiles[0].get("role") == "admin" and profiles[0].get("is_active", True))


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        return write_options(self)

    def do_GET(self):
        if not authenticated_admin(self):
            return write_json(self, {"error": "Dati disponibili solo agli amministratori"}, HTTPStatus.FORBIDDEN)
        try:
            rows = fetch_table(
                "payments",
                select="id,order_id,payment_type,amount,due_date,paid_date,status",
                order="id.asc",
            )
        except RuntimeError as error:
            return write_json(self, {"error": "Pagamenti non disponibili", "detail": str(error)}, HTTPStatus.SERVICE_UNAVAILABLE)
        return write_json(self, {"payments": rows or []})

    def log_message(self, format, *args):
        return
