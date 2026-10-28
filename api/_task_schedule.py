"""Read-only production schedule shared by all account views.

The task's stored planned_date is the requested earliest start. The returned
segments are calculated from order dependencies and employee availability;
this module never rewrites the stored request or the recorded work logs.
"""

from __future__ import annotations

import math
import re
import heapq
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

    Dependencies belong to an article, not every article in its order. Legacy
    tasks without an article retain their order-wide production chain. Ready
    phases compete by requested start / deadline, never by insertion order.
    """
    accounts = {row.get("id"): row for row in users}
    chains = defaultdict(list)
    for row in tasks:
        person = accounts.get(row.get("assigned_user_id"), {})
        if row.get("assigned_user_id") and person.get("is_active") is False:
            continue
        requested = _requested_start(row.get("planned_date") or row.get("due_date"))
        key = _staff_key(row)
        if requested and key and _minutes(row.get("actual_hours") if row.get("status") == "completato" and row.get("actual_hours") else row.get("estimated_hours")):
            article = str(row.get("article_key") or "").strip()
            chain = (row.get("order_id"), article)
            chains[chain].append((row, requested, person, key))

    busy = defaultdict(list)
    result = {}
    ready = []

    def enqueue(chain, index, previous_end=None):
        row, requested, _, _ = chains[chain][index]
        earliest = max(requested, previous_end) if previous_end else requested
        due = str(row.get("due_date") or "9999-12-31")[:10]
        heapq.heappush(ready, (earliest, due, str(chain[0]), str(chain[1]),
                              row["id"], index, chain))

    for chain, entries in chains.items():
        entries.sort(key=lambda entry: (_phase_rank(entry[0]), int(entry[0].get("sequence_order") or 99),
                                        entry[1], entry[0]["id"]))
        enqueue(chain, 0)

    while ready:
        earliest, _, _, _, _, index, chain = heapq.heappop(ready)
        row, _, account, staff_key = chains[chain][index]
        duration = _minutes(row.get("actual_hours") if row.get("status") == "completato" and row.get("actual_hours") else row.get("estimated_hours"))
        segments, end = _allocate(earliest, duration, account, staff_key, busy)
        result[row["id"]] = segments
        # An unplannable predecessor must not release a dependent phase.
        if end and index + 1 < len(chains[chain]):
            enqueue(chain, index + 1, end)
    return result
