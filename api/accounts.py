from __future__ import annotations

from collections import defaultdict
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import clean_text, normalize_choice, parse_positive_int, read_json_body, write_json, write_options
from _supabase import delete_rows, fetch_table, insert_rows, patch_rows


ALLOWED_ROLES = {"admin", "viewer"}


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
        except RuntimeError as error:
            return write_json(self, {"error": "Lettura account non riuscita", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)
        except Exception as error:
            return write_json(self, {"error": "Errore account non previsto", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_POST(self):
        payload = read_json_body(self)
        if payload is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        first_name = clean_text(payload.get("first_name"))
        email = clean_text(payload.get("email")).lower()
        role = normalize_choice(payload.get("role"), ALLOWED_ROLES, "viewer")
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
        except RuntimeError as error:
            detail = str(error)
            status = HTTPStatus.CONFLICT if "duplicate key" in detail.lower() or "unique" in detail.lower() else HTTPStatus.INTERNAL_SERVER_ERROR
            return write_json(self, {"error": "Creazione account non riuscita", "detail": detail}, status)
        except Exception as error:
            return write_json(self, {"error": "Errore account non previsto", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_PATCH(self):
        payload = read_json_body(self)
        if payload is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        user_id = parse_positive_int(payload.get("user_id"))
        first_name = clean_text(payload.get("first_name"))
        email = clean_text(payload.get("email")).lower()
        role = normalize_choice(payload.get("role"), ALLOWED_ROLES, "viewer")
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
        except RuntimeError as error:
            detail = str(error)
            status = HTTPStatus.CONFLICT if "duplicate key" in detail.lower() or "unique" in detail.lower() else HTTPStatus.INTERNAL_SERVER_ERROR
            return write_json(self, {"error": "Aggiornamento account non riuscito", "detail": detail}, status)
        except Exception as error:
            return write_json(self, {"error": "Errore account non previsto", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

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
        except RuntimeError as error:
            return write_json(self, {"error": "Eliminazione account non riuscita", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)
        except Exception as error:
            return write_json(self, {"error": "Errore account non previsto", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def log_message(self, format, *args):
        return