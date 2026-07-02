from __future__ import annotations

import json
import os
import socket
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://fzdqemzowxjuotqalaol.supabase.co").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get(
    "SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk",
)
SUPABASE_REST_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or SUPABASE_ANON_KEY
TIMEOUT_SECONDS = 8
MAX_JSON_BODY_BYTES = 64 * 1024


def clean_text(value):
    return "" if value is None else str(value).strip()


def read_json_body(handler):
    try:
        length = int(handler.headers.get("Content-Length", "0") or "0")
    except ValueError:
        return None
    if length > MAX_JSON_BODY_BYTES:
        return None
    raw = handler.rfile.read(length) if length else b"{}"
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def write_json(handler, payload, status=HTTPStatus.OK):
    body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def write_options(handler):
    handler.send_response(HTTPStatus.NO_CONTENT)
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()


def request_json(url, *, method="GET", payload=None, headers=None):
    data = None
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    request = Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else None
    except HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise RuntimeError(detail or exc.reason) from exc
    except (URLError, TimeoutError, socket.timeout) as exc:
        raise RuntimeError(f"Supabase non raggiungibile entro {TIMEOUT_SECONDS}s: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("Risposta Supabase non valida") from exc


def rest_request(table, *, method="GET", query=None, payload=None, prefer=None):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if query:
        url = f"{url}?{urlencode(query, doseq=True)}"
    headers = {
        "apikey": SUPABASE_REST_KEY,
        "Authorization": f"Bearer {SUPABASE_REST_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return request_json(url, method=method, payload=payload, headers=headers)


def verify_token(handler):
    header = clean_text(handler.headers.get("Authorization"))
    if not header.lower().startswith("bearer "):
        return None
    token = header.split(" ", 1)[1].strip()
    if not token:
        return None
    return request_json(
        f"{SUPABASE_URL}/auth/v1/user",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )


def split_name(metadata, email):
    first_name = clean_text(metadata.get("first_name") or metadata.get("name"))
    last_name = clean_text(metadata.get("last_name"))
    if not first_name:
        first_name = email.split("@", 1)[0] if email else "Dipendente"
    return first_name, last_name


def normalize_profile(row):
    return {
        "id": row.get("id"),
        "auth_user_id": row.get("auth_user_id"),
        "first_name": row.get("first_name") or "",
        "last_name": row.get("last_name") or "",
        "name": " ".join(part for part in [row.get("first_name"), row.get("last_name")] if part).strip(),
        "email": row.get("email") or "",
        "phone": row.get("phone") or "",
        "role": row.get("role") or "viewer",
        "is_active": row.get("is_active") is not False,
        "last_login_at": row.get("last_login_at"),
    }


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def get_existing_profile(auth_user_id, email):
    by_auth = rest_request(
        "users",
        query={"select": "*", "auth_user_id": f"eq.{auth_user_id}", "limit": "1"},
    ) or []
    if by_auth:
        return by_auth[0]
    by_email = rest_request(
        "users",
        query={"select": "*", "email": f"eq.{email}", "limit": "1"},
    ) or []
    return by_email[0] if by_email else None


def sync_profile(auth_user):
    auth_user_id = auth_user.get("id")
    email = clean_text(auth_user.get("email")).lower()
    metadata = auth_user.get("user_metadata") or {}
    first_name, last_name = split_name(metadata, email)
    if not auth_user_id or not email:
        raise RuntimeError("Utente Auth non valido")

    existing = get_existing_profile(auth_user_id, email)
    if existing:
        payload = {
            "auth_user_id": auth_user_id,
            "email": email,
            "last_login_at": utc_now_iso(),
        }
        if not clean_text(existing.get("first_name")):
            payload["first_name"] = first_name
        if not clean_text(existing.get("last_name")) and last_name:
            payload["last_name"] = last_name
        updated = rest_request(
            "users",
            method="PATCH",
            query={"id": f"eq.{existing['id']}"},
            payload=payload,
            prefer="return=representation",
        )
        return normalize_profile((updated or [existing])[0])

    created = rest_request(
        "users",
        method="POST",
        payload={
            "auth_user_id": auth_user_id,
            "first_name": first_name,
            "last_name": last_name or None,
            "phone": None,
            "email": email,
            "role": "viewer",
            "is_active": True,
            "last_login_at": utc_now_iso(),
        },
        prefer="return=representation",
    )
    return normalize_profile(created[0])


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        return write_options(self)

    def do_GET(self):
        return self._handle_profile()

    def do_POST(self):
        return self._handle_profile()

    def _handle_profile(self):
        try:
            auth_user = verify_token(self)
            if not auth_user:
                return write_json(self, {"error": "Accesso non valido"}, HTTPStatus.UNAUTHORIZED)
            profile = sync_profile(auth_user)
            status = HTTPStatus.OK if profile["is_active"] else HTTPStatus.FORBIDDEN
            return write_json(self, {"profile": profile}, status)
        except Exception as error:
            return write_json(
                self,
                {"error": "Profilo accesso non disponibile", "detail": str(error)},
                HTTPStatus.INTERNAL_SERVER_ERROR,
            )

    def log_message(self, format, *args):
        return
