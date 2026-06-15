from __future__ import annotations

import json
import os
import socket
from collections import defaultdict
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://fzdqemzowxjuotqalaol.supabase.co").rstrip("/")
SUPABASE_KEY = os.environ.get(
    "SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZHFlbXpvd3hqdW90cWFsYW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njg3NzYsImV4cCI6MjA5NTU0NDc3Nn0.fmZ9RThFxnaJGQsOYeu_ZjjUNHThlRX87qz9sX4N6Mk",
)
TIMEOUT_SECONDS = 8
MAX_JSON_BODY_BYTES = 128 * 1024
ALLOWED_ROLES = {"admin", "viewer"}


def clean_text(value):
    return "" if value is None else str(value).strip()


def parse_positive_int(value):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def normalize_role(value):
    role = clean_text(value).lower()
    return role if role in ALLOWED_ROLES else "viewer"


def clean_skills(raw):
    if not isinstance(raw, list):
        return None
    cleaned = []
    seen = set()
    for item in raw:
        skill = clean_text(item)
        key = skill.lower()
        if skill and key not in seen:
            cleaned.append(skill)
            seen.add(key)
    return cleaned


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
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def write_options(handler):
    handler.send_response(HTTPStatus.NO_CONTENT)
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()


def supabase_request(path, *, method="GET", query=None, payload=None, prefer=None):
    url = f"{SUPABASE_URL}{path}"
    if query:
        url = f"{url}?{urlencode(query, doseq=True)}"

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer

    data = None
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=True).encode("utf-8")

    request = Request(url, data=data, headers=headers, method=method)
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


def fetch_table(table, *, select="*", filters=None, order=None):
    query = {"select": select}
    if filters:
        query.update(filters)
    if order:
        query["order"] = order
    return supabase_request(f"/rest/v1/{table}", query=query) or []


def insert_rows(table, payload, *, returning="representation"):
    return supabase_request(f"/rest/v1/{table}", method="POST", payload=payload, prefer=f"return={returning}")


def patch_rows(table, *, filters, payload, returning="representation"):
    return supabase_request(
        f"/rest/v1/{table}",
        method="PATCH",
        query=filters,
        payload=payload,
        prefer=f"return={returning}",
    )


def delete_rows(table, *, filters):
    return supabase_request(f"/rest/v1/{table}", method="DELETE", query=filters, prefer="return=minimal")


def load_accounts():
    users = fetch_table("users", order="id.asc")
    skills = fetch_table("user_skills", order="id.asc")
    tasks = fetch_table("order_tasks", select="id,assigned_user_id")

    skill_map = defaultdict(list)
    seen = defaultdict(set)
    for row in skills:
        user_id = row.get("user_id")
        skill = clean_text(row.get("skill_name"))
        key = skill.lower()
        if user_id and skill and key not in seen[user_id]:
            skill_map[user_id].append(skill)
            seen[user_id].add(key)

    task_count = defaultdict(int)
    for task in tasks:
        assigned_user_id = task.get("assigned_user_id")
        if assigned_user_id:
            task_count[assigned_user_id] += 1

    accounts = []
    for row in users:
        full_name = " ".join(part for part in [row.get("first_name"), row.get("last_name")] if part).strip()
        accounts.append(
            {
                "id": row["id"],
                "first_name": row.get("first_name") or "",
                "last_name": row.get("last_name") or "",
                "name": full_name,
                "phone": row.get("phone") or "",
                "email": row.get("email") or "",
                "role": "Amministratore" if row.get("role") == "admin" else "Visualizzatore",
                "role_key": row.get("role") or "viewer",
                "is_active": bool(row.get("is_active")),
                "skills": ", ".join(skill_map[row["id"]]),
                "assigned_tasks": task_count[row["id"]],
            }
        )
    return accounts


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        return write_options(self)

    def do_GET(self):
        try:
            return write_json(self, {"accounts": load_accounts()})
        except Exception as error:
            return write_json(self, {"error": "Lettura account non riuscita", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_POST(self):
        payload = read_json_body(self)
        if payload is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        first_name = clean_text(payload.get("first_name"))
        email = clean_text(payload.get("email")).lower()
        role = normalize_role(payload.get("role"))
        skills = clean_skills(payload.get("skills", []))

        if not first_name:
            return write_json(self, {"error": "Nome obbligatorio"}, HTTPStatus.BAD_REQUEST)
        if not email or "@" not in email:
            return write_json(self, {"error": "Email non valida"}, HTTPStatus.BAD_REQUEST)
        if skills is None:
            return write_json(self, {"error": "Skill non valide"}, HTTPStatus.BAD_REQUEST)

        try:
            created = insert_rows(
                "users",
                {
                    "first_name": first_name,
                    "last_name": clean_text(payload.get("last_name")) or None,
                    "phone": clean_text(payload.get("phone")) or None,
                    "email": email,
                    "role": role,
                    "is_active": True,
                },
            )
            user = created[0]
            for skill in skills:
                insert_rows("user_skills", {"user_id": user["id"], "skill_name": skill}, returning="minimal")
            return write_json(self, {"account": user, "accounts": load_accounts()}, HTTPStatus.CREATED)
        except Exception as error:
            detail = str(error)
            status = HTTPStatus.CONFLICT if "duplicate key" in detail.lower() or "unique" in detail.lower() else HTTPStatus.INTERNAL_SERVER_ERROR
            return write_json(self, {"error": "Creazione account non riuscita", "detail": detail}, status)

    def do_PATCH(self):
        payload = read_json_body(self)
        if payload is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        user_id = parse_positive_int(payload.get("user_id"))
        first_name = clean_text(payload.get("first_name"))
        email = clean_text(payload.get("email")).lower()
        role = normalize_role(payload.get("role"))
        skills = clean_skills(payload.get("skills", []))

        if not user_id:
            return write_json(self, {"error": "Account non valido"}, HTTPStatus.BAD_REQUEST)
        if not first_name:
            return write_json(self, {"error": "Nome obbligatorio"}, HTTPStatus.BAD_REQUEST)
        if not email or "@" not in email:
            return write_json(self, {"error": "Email non valida"}, HTTPStatus.BAD_REQUEST)
        if skills is None:
            return write_json(self, {"error": "Skill non valide"}, HTTPStatus.BAD_REQUEST)

        try:
            rows = patch_rows(
                "users",
                filters={"id": f"eq.{user_id}"},
                payload={
                    "first_name": first_name,
                    "last_name": clean_text(payload.get("last_name")) or None,
                    "phone": clean_text(payload.get("phone")) or None,
                    "email": email,
                    "role": role,
                    "is_active": bool(payload.get("is_active", True)),
                },
            )
            if not rows:
                return write_json(self, {"error": "Account non trovato"}, HTTPStatus.NOT_FOUND)
            delete_rows("user_skills", filters={"user_id": f"eq.{user_id}"})
            for skill in skills:
                insert_rows("user_skills", {"user_id": user_id, "skill_name": skill}, returning="minimal")
            return write_json(self, {"account": rows[0], "accounts": load_accounts()})
        except Exception as error:
            return write_json(self, {"error": "Aggiornamento account non riuscito", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

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
                patch_rows("users", filters={"id": f"eq.{user_id}"}, payload={"is_active": False})
                return write_json(
                    self,
                    {
                        "mode": "deactivated",
                        "message": "Account disattivato per mantenere lo storico dei task assegnati",
                        "accounts": load_accounts(),
                    },
                )
            delete_rows("user_skills", filters={"user_id": f"eq.{user_id}"})
            delete_rows("users", filters={"id": f"eq.{user_id}"})
            return write_json(self, {"mode": "deleted", "message": "Account eliminato", "accounts": load_accounts()})
        except Exception as error:
            return write_json(self, {"error": "Eliminazione account non riuscita", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def log_message(self, format, *args):
        return