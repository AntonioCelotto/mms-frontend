from __future__ import annotations

from collections import defaultdict
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import clean_text, normalize_choice, parse_optional_number, parse_positive_int, read_json_body, write_json, write_options
from _supabase import delete_rows, fetch_table, insert_rows, patch_rows


ALLOWED_ROLES = {"admin", "viewer"}
ALLOWED_WORKING_DAYS = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato", "domenica"]
DEFAULT_WORKING_DAYS = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi"]


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


def clean_working_days(raw_days):
    if raw_days in (None, ""):
        return DEFAULT_WORKING_DAYS[:]
    if isinstance(raw_days, str):
        raw_days = [item.strip() for item in raw_days.split(",")]
    if not isinstance(raw_days, list):
        return None
    normalized = []
    seen = set()
    for item in raw_days:
        day = clean_text(item).lower()
        if day in ALLOWED_WORKING_DAYS and day not in seen:
            normalized.append(day)
            seen.add(day)
    return normalized


def clean_non_negative_number(value, default):
    parsed = parse_optional_number(value)
    if parsed is None:
        return default
    return parsed if parsed >= 0 else None


def account_payload(row, skill_map, task_count):
    full_name = " ".join(part for part in [row.get("first_name"), row.get("last_name")] if part).strip()
    return {
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
        "daily_work_hours": float(row.get("daily_work_hours") or 0),
        "hourly_cost": float(row.get("hourly_cost") or 0),
        "working_days": row.get("working_days") or [],
    }


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        return write_options(self)

    def do_GET(self):
        try:
            users = fetch_table("users", order="id.asc")
            skills = fetch_table("user_skills", order="id.asc")
            tasks = fetch_table("order_tasks", select="id,assigned_user_id")
        except RuntimeError as error:
            return write_json(self, {"error": "Lettura account non riuscita", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        skill_map = defaultdict(list)
        seen_skills = defaultdict(set)
        for row in skills:
            user_id = row.get("user_id")
            skill_name = clean_text(row.get("skill_name"))
            key = skill_name.lower()
            if user_id and skill_name and key not in seen_skills[user_id]:
                skill_map[user_id].append(skill_name)
                seen_skills[user_id].add(key)

        task_count = defaultdict(int)
        for task in tasks:
            assigned_user_id = task.get("assigned_user_id")
            if assigned_user_id:
                task_count[assigned_user_id] += 1

        accounts = [account_payload(row, skill_map, task_count) for row in users]
        return write_json(self, {"accounts": accounts})

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

        skills = clean_skills(payload.get("skills", []))
        if skills is None:
            return write_json(self, {"error": "Skill non valide"}, HTTPStatus.BAD_REQUEST)
        working_days = clean_working_days(payload.get("working_days"))
        if working_days is None:
            return write_json(self, {"error": "Giorni lavorativi non validi"}, HTTPStatus.BAD_REQUEST)
        daily_work_hours = clean_non_negative_number(payload.get("daily_work_hours"), 8)
        hourly_cost = clean_non_negative_number(payload.get("hourly_cost"), 10)
        if daily_work_hours is None or hourly_cost is None:
            return write_json(self, {"error": "Ore lavoro o costo orario non validi"}, HTTPStatus.BAD_REQUEST)

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
                    "daily_work_hours": daily_work_hours,
                    "hourly_cost": hourly_cost,
                    "working_days": working_days,
                },
            )
            user = created[0]
            for skill in skills:
                insert_rows("user_skills", {"user_id": user["id"], "skill_name": skill}, returning="minimal")
        except RuntimeError as error:
            detail = str(error)
            status = HTTPStatus.CONFLICT if "duplicate key" in detail.lower() or "unique" in detail.lower() else HTTPStatus.INTERNAL_SERVER_ERROR
            return write_json(self, {"error": "Creazione account non riuscita", "detail": detail}, status)

        return write_json(self, user, HTTPStatus.CREATED)

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
        working_days = clean_working_days(payload.get("working_days"))
        if working_days is None:
            return write_json(self, {"error": "Giorni lavorativi non validi"}, HTTPStatus.BAD_REQUEST)
        daily_work_hours = clean_non_negative_number(payload.get("daily_work_hours"), 8)
        hourly_cost = clean_non_negative_number(payload.get("hourly_cost"), 10)
        if daily_work_hours is None or hourly_cost is None:
            return write_json(self, {"error": "Ore lavoro o costo orario non validi"}, HTTPStatus.BAD_REQUEST)

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
                    "daily_work_hours": daily_work_hours,
                    "hourly_cost": hourly_cost,
                    "working_days": working_days,
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
                rows = patch_rows("users", filters={"id": f"eq.{user_id}"}, payload={"is_active": False})
                if not rows:
                    return write_json(self, {"error": "Account non trovato"}, HTTPStatus.NOT_FOUND)
                return write_json(
                    self,
                    {
                        "mode": "deactivated",
                        "message": "Account disattivato per mantenere lo storico dei task assegnati",
                        "account": rows[0],
                    },
                )

            delete_rows("user_skills", filters={"user_id": f"eq.{user_id}"})
            delete_rows("users", filters={"id": f"eq.{user_id}"})
        except RuntimeError as error:
            return write_json(self, {"error": "Eliminazione account non riuscita", "detail": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        return write_json(self, {"mode": "deleted", "message": "Account eliminato"})

    def log_message(self, format, *args):
        return