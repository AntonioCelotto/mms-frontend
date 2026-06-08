from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import clean_text, normalize_choice, read_json_body, write_json
from _supabase import insert_rows


ALLOWED_ROLES = {"admin", "viewer"}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        payload = read_json_body(self)
        if payload is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        first_name = clean_text(payload.get("first_name"))
        email = clean_text(payload.get("email"))
        role = normalize_choice(payload.get("role"), ALLOWED_ROLES, "viewer")
        if not first_name:
            return write_json(self, {"error": "Nome obbligatorio"}, HTTPStatus.BAD_REQUEST)
        if not email or "@" not in email:
            return write_json(self, {"error": "Email non valida"}, HTTPStatus.BAD_REQUEST)

        skills = payload.get("skills", [])
        if not isinstance(skills, list):
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
                skill_name = clean_text(skill)
                if skill_name:
                    insert_rows("user_skills", {"user_id": user["id"], "skill_name": skill_name})
        except RuntimeError as error:
            detail = str(error)
            status = HTTPStatus.CONFLICT if "duplicate key" in detail.lower() or "unique" in detail.lower() else HTTPStatus.INTERNAL_SERVER_ERROR
            return write_json(self, {"error": "Creazione account non riuscita", "detail": detail}, status)

        return write_json(self, user, HTTPStatus.CREATED)

    def log_message(self, format, *args):
        return
