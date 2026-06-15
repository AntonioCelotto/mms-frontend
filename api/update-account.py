from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import clean_text, normalize_choice, parse_positive_int, read_json_body, write_json
from _supabase import delete_rows, insert_rows, patch_rows


ALLOWED_ROLES = {"admin", "viewer"}


def clean_skills(raw_skills):
    if not isinstance(raw_skills, list):
        return None
    cleaned = []
    seen = set()
    for item in raw_skills:
        skill = clean_text(item)
        key = skill.lower()
        if skill and key not in seen:
            cleaned.append(skill)
            seen.add(key)
    return cleaned


class handler(BaseHTTPRequestHandler):
    def do_PATCH(self):
        payload = read_json_body(self)
        if payload is None:
            return write_json(self, {"error": "JSON non valido"}, HTTPStatus.BAD_REQUEST)

        user_id = parse_positive_int(payload.get("user_id"))
        if not user_id:
            return write_json(self, {"error": "Account non valido"}, HTTPStatus.BAD_REQUEST)

        first_name = clean_text(payload.get("first_name"))
        email = clean_text(payload.get("email"))
        role = normalize_choice(payload.get("role"), ALLOWED_ROLES, "viewer")
        skills = clean_skills(payload.get("skills", []))
        if skills is None:
            return write_json(self, {"error": "Skill non valide"}, HTTPStatus.BAD_REQUEST)
        if not first_name:
            return write_json(self, {"error": "Nome obbligatorio"}, HTTPStatus.BAD_REQUEST)
        if not email or "@" not in email:
            return write_json(self, {"error": "Email non valida"}, HTTPStatus.BAD_REQUEST)

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
        except RuntimeError as error:
            detail = str(error)
            status = HTTPStatus.CONFLICT if "duplicate key" in detail.lower() or "unique" in detail.lower() else HTTPStatus.INTERNAL_SERVER_ERROR
            return write_json(self, {"error": "Aggiornamento account non riuscito", "detail": detail}, status)

        return write_json(self, rows[0])

    def log_message(self, format, *args):
        return
