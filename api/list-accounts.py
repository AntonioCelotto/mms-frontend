from __future__ import annotations

from collections import defaultdict
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from _api import write_json
from _supabase import fetch_table


class handler(BaseHTTPRequestHandler):
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
            skill_name = str(row.get("skill_name") or "").strip()
            key = skill_name.lower()
            if user_id and skill_name and key not in seen_skills[user_id]:
                skill_map[user_id].append(skill_name)
                seen_skills[user_id].add(key)

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

        return write_json(self, {"accounts": accounts})

    def log_message(self, format, *args):
        return
