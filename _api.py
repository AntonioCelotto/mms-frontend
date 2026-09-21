from __future__ import annotations

import json
import os
import socket
from http import HTTPStatus
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

MAX_JSON_BODY_BYTES = 128 * 1024
ALLOWED_HEADERS = "Content-Type, Authorization"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://fzdqemzowxjuotqalaol.supabase.co").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_REST_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or SUPABASE_ANON_KEY
AUTH_TIMEOUT_SECONDS = 8
ALLOWED_ORIGINS = {
    "https://www.mmsgestionale.com",
    "https://mmsgestionale.com",
    "https://mms-frontend-eight.vercel.app",
}
COMMERCE_SKILLS = {"clienti", "preventivi", "ordini", "pagamenti", "magazzino"}


def _allowed_origin(handler):
    origin = str(handler.headers.get("Origin") or "").strip().rstrip("/")
    if not origin:
        return None
    if origin in ALLOWED_ORIGINS or origin.startswith("http://localhost:"):
        return origin
    if origin.startswith("https://") and origin.endswith(".vercel.app"):
        return origin
    return None


def _write_cors_headers(handler):
    origin = _allowed_origin(handler)
    if origin:
        handler.send_header("Access-Control-Allow-Origin", origin)
        handler.send_header("Vary", "Origin")


def _request_json(url, *, headers=None):
    request = Request(url, headers=headers or {}, method="GET")
    try:
        with urlopen(request, timeout=AUTH_TIMEOUT_SECONDS) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else None
    except HTTPError as exc:
        if exc.code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN):
            return None
        raise RuntimeError("Verifica accesso non disponibile") from exc
    except (URLError, TimeoutError, socket.timeout, json.JSONDecodeError) as exc:
        raise RuntimeError("Verifica accesso non disponibile") from exc


def _rest_rows(table, query):
    if not SUPABASE_URL or not SUPABASE_REST_KEY:
        raise RuntimeError("Configurazione sicurezza mancante")
    url = f"{SUPABASE_URL}/rest/v1/{table}?{urlencode(query, doseq=True)}"
    rows = _request_json(url, headers={
        "apikey": SUPABASE_REST_KEY,
        "Authorization": f"Bearer {SUPABASE_REST_KEY}",
        "Content-Type": "application/json",
    })
    return rows if isinstance(rows, list) else []


def request_profile(handler):
    cached = getattr(handler, "_mms_request_profile", None)
    if cached is not None:
        return cached
    authorization = str(handler.headers.get("Authorization") or "").strip()
    if not authorization.lower().startswith("bearer ") or not SUPABASE_ANON_KEY:
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token or token == SUPABASE_REST_KEY:
        return None
    auth_user = _request_json(f"{SUPABASE_URL}/auth/v1/user", headers={
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    auth_user_id = str((auth_user or {}).get("id") or "").strip()
    email = str((auth_user or {}).get("email") or "").strip().lower()
    if not auth_user_id:
        return None
    rows = _rest_rows("users", {
        "select": "id,auth_user_id,email,role,is_active",
        "auth_user_id": f"eq.{auth_user_id}",
        "limit": "1",
    })
    if not rows and email:
        rows = _rest_rows("users", {
            "select": "id,auth_user_id,email,role,is_active",
            "email": f"eq.{email}",
            "limit": "1",
        })
    if not rows or rows[0].get("is_active") is False:
        return None
    row = rows[0]
    skills = _rest_rows("user_skills", {"select": "skill_name", "user_id": f"eq.{row['id']}"})
    skill_keys = {str(item.get("skill_name") or "").strip().lower() for item in skills}
    access_profile = "admin" if row.get("role") == "admin" else ("commerce" if skill_keys.intersection(COMMERCE_SKILLS) else "operator")
    profile = {
        "id": row.get("id"),
        "auth_user_id": auth_user_id,
        "email": email,
        "role": row.get("role") or "viewer",
        "access_profile": access_profile,
        "skills": sorted(skill_keys),
        "is_active": True,
    }
    handler._mms_request_profile = profile
    return profile


def require_access(handler, allowed_profiles=None):
    try:
        profile = request_profile(handler)
    except RuntimeError:
        write_json(handler, {"error": "Verifica accesso temporaneamente non disponibile"}, HTTPStatus.SERVICE_UNAVAILABLE)
        return None
    if not profile:
        write_json(handler, {"error": "Accesso richiesto"}, HTTPStatus.UNAUTHORIZED)
        return None
    if allowed_profiles and profile.get("access_profile") not in set(allowed_profiles):
        write_json(handler, {"error": "Operazione non autorizzata"}, HTTPStatus.FORBIDDEN)
        return None
    return profile


def profile_can_access_task(profile, task_id):
    if not profile or not task_id:
        return False
    if profile.get("access_profile") in {"admin", "commerce"}:
        return True
    rows = _rest_rows("order_tasks", {
        "select": "id", "id": f"eq.{task_id}",
        "assigned_user_id": f"eq.{profile.get('id')}", "limit": "1",
    })
    return bool(rows)


def profile_can_access_order(profile, order_id):
    if not profile or not order_id:
        return False
    if profile.get("access_profile") in {"admin", "commerce"}:
        return True
    rows = _rest_rows("order_tasks", {
        "select": "id", "order_id": f"eq.{order_id}",
        "assigned_user_id": f"eq.{profile.get('id')}", "limit": "1",
    })
    return bool(rows)


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
    _write_cors_headers(handler)
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", ALLOWED_HEADERS)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def write_options(handler):
    handler.send_response(HTTPStatus.NO_CONTENT)
    _write_cors_headers(handler)
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", ALLOWED_HEADERS)
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()


def parse_positive_int(value):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def parse_optional_positive_int(value):
    if value in (None, "", 0, "0"):
        return None
    return parse_positive_int(value)


def parse_optional_number(value):
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def clean_text(value):
    if value is None:
        return ""
    return str(value).strip()


def normalize_choice(value, allowed, default=None):
    normalized = clean_text(value).lower()
    if normalized in allowed:
        return normalized
    return default


def public_error(message, status=HTTPStatus.BAD_REQUEST):
    return {"error": message}, status
