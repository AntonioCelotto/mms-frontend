"""Read-only production schedule shared by all account views.

The task's stored planned_date is the requested earliest start. The returned
segments are calculated from order dependencies and employee availability;
this module never rewrites the stored request or the recorded work logs.
"""

from __future__ import annotations

import math
import re
from collections import defaultdict
from datetime import date, datetime, timedelta


DAY_NAMES = ("lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato", "domenica")
DEFAULT_DAYS = set(DAY_NAMES[:5])
WORK_WINDOWS = ((8 * 60, 13 * 60), (14 * 60, 17 * 60))
PHASE_ORDER = ("cartamodello", "taglio", "confezione", "controllo")
MAX_DAYS = 366


def _requested_start(value):
    match = re.match(r"^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))?", str(value or "").strip())
    if not match:
        return None
    try:
        day = date.fromisoformat(match.group(1))
        hour = int(match.group(2) or 8)
        minute = int(match.group(3) or 0)
        return datetime(day.year, day.month, day.day, hour, minute)
    except ValueError:
        return None


def _minutes(value):
    try:
        hours = float(value)
    except (TypeError, ValueError):
        return 0
    return round(hours * 60) if math.isfinite(hours) and hours > 0 else 0


def _phase_rank(row):
    raw = str(row.get("task_phase") or "").strip().lower().replace("_", " ")
    return next((index for index, phase in enumerate(PHASE_ORDER) if phase in raw), len(PHASE_ORDER))


def _working_days(account):
    raw = account.get("working_days")
    values = raw if isinstance(raw, list) else str(raw or "").split(",")
    days = {str(value).strip().lower() for value in values if str(value).strip()}
    return days or DEFAULT_DAYS


def _clock(minute):
    return f"{minute // 60:02d}:{minute % 60:02d}"


def _staff_key(row):
    if row.get("assigned_user_id"):
        return f"user:{row['assigned_user_id']}"
    external = str(row.get("external_supplier_name") or "").strip().lower()
    return f"external:{external}" if external else None


def _allocate(start, duration, account, staff_key, busy):
    allowed_days = _working_days(account)
    daily_limit = min(8 * 60, _minutes(account.get("daily_work_hours")) or 8 * 60)
    remaining = duration
    intervals = []
    day = start.date()

    for _ in range(MAX_DAYS):
        if DAY_NAMES[day.weekday()] in allowed_days:
            day_key = (staff_key, day.isoformat())
            reservations = busy[day_key]
            available = max(0, daily_limit - sum(end - begin for begin, end in reservations))
            for window_start, window_end in WORK_WINDOWS:
                cursor = max(window_start, start.hour * 60 + start.minute if day == start.date() else window_start)
                while cursor < window_end and available > 0 and remaining > 0:
                    overlap = next(((begin, end) for begin, end in sorted(reservations)
                                    if end > cursor and begin < window_end), None)
                    if overlap and overlap[0] <= cursor:
                        cursor = overlap[1]
                        continue
                    free_end = min(window_end, overlap[0] if overlap else window_end)
                    length = min(remaining, available, free_end - cursor)
                    if length <= 0:
                        break
                    reservations.append((cursor, cursor + length))
                    intervals.append((day.isoformat(), cursor, cursor + length))
                    remaining -= length
                    available -= length
                    cursor += length
                if remaining == 0:
                    break
        if remaining == 0:
            break
        day += timedelta(days=1)

    if remaining:
        # An impossible task must not produce a misleading partial calendar.
        for iso, begin, end in intervals:
            busy[(staff_key, iso)].remove((begin, end))
        return [], None

    grouped = defaultdict(list)
    for iso, begin, end in intervals:
        grouped[iso].append((begin, end))
    segments = [{
        "date": iso,
        "hours": round(sum(end - begin for begin, end in slots) / 60, 2),
        "label": " / ".join(f"{_clock(begin)}–{_clock(end)}" for begin, end in slots),
    } for iso, slots in grouped.items()]
    last_date, _, last_end = intervals[-1]
    return segments, _requested_start(f"{last_date} {_clock(last_end)}")


def schedule_task_segments(tasks, users):
    """Return {task_id: daily segments}, accounting for every order and user.

    Sorting is by requested start / deadline between orders, then by production
    phase inside each order. A phase cannot begin before the previous one ends.
    """
    accounts = {row.get("id"): row for row in users}
    by_order = defaultdict(list)
    for row in tasks:
        person = accounts.get(row.get("assigned_user_id"), {})
        if row.get("assigned_user_id") and person.get("is_active") is False:
            continue
        requested = _requested_start(row.get("planned_date") or row.get("due_date"))
        key = _staff_key(row)
        if requested and key and _minutes(row.get("actual_hours") if row.get("status") == "completato" and row.get("actual_hours") else row.get("estimated_hours")):
            by_order[row.get("order_id")].append((row, requested, person, key))

    def order_sort(item):
        order_id, entries = item
        start = min(entry[1] for entry in entries)
        due = min(str(entry[0].get("due_date") or "9999-12-31")[:10] for entry in entries)
        return start, due, str(order_id)

    busy = defaultdict(list)
    result = {}
    for _, entries in sorted(by_order.items(), key=order_sort):
        chain_end = None
        entries.sort(key=lambda entry: (_phase_rank(entry[0]), int(entry[0].get("sequence_order") or 99), entry[0]["id"]))
        for row, requested, account, staff_key in entries:
            earliest = max(requested, chain_end) if chain_end else requested
            duration = _minutes(row.get("actual_hours") if row.get("status") == "completato" and row.get("actual_hours") else row.get("estimated_hours"))
            segments, end = _allocate(earliest, duration, account, staff_key, busy)
            result[row["id"]] = segments
            if end:
                chain_end = end
    return result
