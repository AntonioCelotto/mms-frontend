from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta

from _supabase import fetch_table, patch_rows


PHASE_ORDER = {"cartamodello": 1, "taglio": 2, "confezione": 3}
DAY_KEYS = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato", "domenica"]
DEFAULT_DAYS = {"lunedi", "martedi", "mercoledi", "giovedi", "venerdi"}


def _date(value):
    raw = str(value or "").strip()[:10]
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def _hours(value):
    try:
        return max(0.0, float(value or 0))
    except (TypeError, ValueError):
        return 0.0


def _phase(value):
    raw = str(value or "").strip().lower()
    for key in PHASE_ORDER:
        if key in raw:
            return key
    return raw or "altro"


def _work_days(user):
    raw = user.get("working_days")
    values = raw if isinstance(raw, list) else str(raw or "").split(",")
    cleaned = {str(item).strip().lower() for item in values if str(item).strip()}
    return cleaned or DEFAULT_DAYS


def _is_work_day(day, days):
    return DAY_KEYS[day.weekday()] in days


def _allocate(task, user, occupancy, earliest):
    remaining = _hours(task.get("estimated_hours"))
    daily = _hours(user.get("daily_work_hours")) or 8.0
    days = _work_days(user)
    cursor = max(earliest, date.today())
    start = None
    end = None
    guard = 0
    segments = []
    while remaining > 0.0001 and guard < 1095:
        if _is_work_day(cursor, days):
            key = (task.get("assigned_user_id"), cursor.isoformat())
            used = occupancy[key]
            free = max(0.0, daily - used)
            if free > 0:
                allocated = min(free, remaining)
                if start is None:
                    start = cursor
                end = cursor
                occupancy[key] += allocated
                remaining -= allocated
                segments.append({"date": cursor.isoformat(), "hours": round(allocated, 2)})
        cursor += timedelta(days=1)
        guard += 1
    return start, end, segments, remaining


def build_schedule():
    users = {row["id"]: row for row in fetch_table("users", select="id,first_name,last_name,daily_work_hours,working_days,is_active")}
    tasks = fetch_table(
        "order_tasks",
        select="id,order_id,assigned_user_id,task_name,task_phase,status,planned_date,completed_date,estimated_hours,actual_hours,article_key,article_name,due_date,sequence_order",
        order="id.asc",
    )
    completed = [row for row in tasks if str(row.get("status") or "").lower() == "completato"]
    candidates = [
        row for row in tasks
        if row.get("assigned_user_id") in users
        and users[row.get("assigned_user_id")].get("is_active", True)
        and str(row.get("status") or "").lower() != "completato"
        and _hours(row.get("estimated_hours")) > 0
        and (_date(row.get("due_date")) or _date(row.get("planned_date")))
    ]
    for row in candidates:
        row["_due"] = _date(row.get("due_date")) or _date(row.get("planned_date"))
        row["_phase"] = _phase(row.get("task_phase"))
        row["_sequence"] = int(row.get("sequence_order") or PHASE_ORDER.get(row["_phase"], 99))
        article_key = str(row.get("article_key") or "").strip()
        row["_chain"] = (row.get("order_id"), article_key) if article_key else ("task", row.get("id"))

    occupancy = defaultdict(float)
    chain_end = {}
    for row in completed:
        completed_on = _date(row.get("completed_date")) or _date(row.get("planned_date"))
        assignee = row.get("assigned_user_id")
        if completed_on and assignee:
            occupancy[(assignee, completed_on.isoformat())] += _hours(row.get("actual_hours"))
        article_key = str(row.get("article_key") or "").strip()
        if completed_on and article_key:
            chain = (row.get("order_id"), article_key)
            chain_end[chain] = max(chain_end.get(chain, completed_on), completed_on)

    chains = defaultdict(list)
    for row in candidates:
        chains[row["_chain"]].append(row)
    ordered_chains = []
    for chain, rows in chains.items():
        rows.sort(key=lambda row: (row["_sequence"], row["_due"], row["id"]))
        ordered_chains.append((min(row["_due"] for row in rows), chain, rows))
    ordered_chains.sort(key=lambda item: (item[0], str(item[1])))
    changes = []
    conflicts = []

    for _, chain, rows in ordered_chains:
        for task in rows:
            earliest = chain_end.get(chain) or date.today()
            start, end, segments, remaining = _allocate(task, users[task["assigned_user_id"]], occupancy, earliest)
            if end:
                chain_end[chain] = end
            warning = ""
            if remaining > 0.0001:
                warning = "Pianificazione non completabile nei giorni configurati"
            elif end and end > task["_due"]:
                warning = f"Consegna richiesta {task['_due'].isoformat()}, prima conclusione possibile {end.isoformat()}"
            old_start = _date(task.get("planned_date"))
            if start and old_start != start:
                changes.append({"task_id": task["id"], "task_name": task.get("task_name") or "Task", "article_name": task.get("article_name") or "", "from": old_start.isoformat() if old_start else None, "to": start.isoformat(), "end": end.isoformat() if end else None, "segments": segments})
            if warning:
                conflicts.append({"task_id": task["id"], "task_name": task.get("task_name") or "Task", "message": warning})
            task["_planned_start"] = start
            task["_warning"] = warning
    return candidates, changes, conflicts


def reschedule_tasks(apply=False):
    tasks, changes, conflicts = build_schedule()
    if apply:
        for task in tasks:
            start = task.get("_planned_start")
            patch_rows(
                "order_tasks",
                filters={"id": f"eq.{task['id']}"},
                payload={
                    "planned_date": start.isoformat() if start else None,
                    "calendar_day_label": DAY_KEYS[start.weekday()] if start else None,
                    "schedule_warning": task.get("_warning") or None,
                },
                returning="minimal",
            )
    return {"changes": changes, "conflicts": conflicts, "applied": bool(apply)}
