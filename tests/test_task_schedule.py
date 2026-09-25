import copy
import unittest

from api._task_schedule import schedule_task_segments


USERS = [
    {"id": 22, "is_active": True, "daily_work_hours": 8, "working_days": ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi"]},
    {"id": 23, "is_active": True, "daily_work_hours": 8, "working_days": ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi"]},
]


def task(task_id, order_id, phase, hours, operator, planned="2026-09-25"):
    return {"id": task_id, "order_id": order_id, "task_phase": phase, "estimated_hours": hours,
            "assigned_user_id": operator, "planned_date": planned, "status": "da_avviare"}


def labels(segments, task_id):
    return [row["label"] for row in segments[task_id]]


class ScheduleTest(unittest.TestCase):
    def test_reverse_insert_order_respects_phase_dependencies(self):
        rows = [task(2873, 1149, "controllo", .5, 23), task(2874, 1149, "confezione", 2, 22),
                task(2875, 1149, "cartamodello", .5, 22), task(2876, 1149, "taglio", 1, 22)]
        original = copy.deepcopy(rows)
        schedule = schedule_task_segments(rows, USERS)
        self.assertEqual(labels(schedule, 2875), ["08:00–08:30"])
        self.assertEqual(labels(schedule, 2876), ["08:30–09:30"])
        self.assertEqual(labels(schedule, 2874), ["09:30–11:30"])
        self.assertEqual(labels(schedule, 2873), ["11:30–12:00"])
        self.assertEqual(rows, original)

    def test_lunch_from_thirteen_to_fourteen_and_next_day(self):
        rows = [task(1, 1, "taglio", 4, 22, "2026-09-25 11:30")]
        self.assertEqual(labels(schedule_task_segments(rows, USERS), 1), ["11:30–13:00 / 14:00–16:30"])
        rows[0]["estimated_hours"] = 9
        schedule = schedule_task_segments(rows, USERS)
        self.assertEqual(schedule[1], [
            {"date": "2026-09-25", "hours": 4.5, "label": "11:30–13:00 / 14:00–17:00"},
            {"date": "2026-09-28", "hours": 4.5, "label": "08:00–12:30"},
        ])

    def test_employee_booking_on_another_order_delays_entire_chain(self):
        rows = [task(1, 1, "taglio", 1, 22), task(2, 2, "cartamodello", .5, 22),
                task(3, 2, "taglio", 1, 22), task(4, 2, "confezione", 2, 23)]
        schedule = schedule_task_segments(rows, USERS)
        self.assertEqual(labels(schedule, 1), ["08:00–09:00"])
        self.assertEqual(labels(schedule, 2), ["09:00–09:30"])
        self.assertEqual(labels(schedule, 3), ["09:30–10:30"])
        self.assertEqual(labels(schedule, 4), ["10:30–12:30"])

    def test_other_employee_can_work_on_different_order_in_parallel(self):
        rows = [task(1, 1, "taglio", 1, 22), task(2, 2, "taglio", 1, 23)]
        schedule = schedule_task_segments(rows, USERS)
        self.assertEqual(labels(schedule, 1), ["08:00–09:00"])
        self.assertEqual(labels(schedule, 2), ["08:00–09:00"])

    def test_full_day_from_eight_skips_lunch_and_new_order_moves_to_monday(self):
        rows = [task(1, 1, "taglio", 8, 22), task(2, 2, "taglio", 1, 22)]
        schedule = schedule_task_segments(rows, USERS)
        self.assertEqual(labels(schedule, 1), ["08:00–13:00 / 14:00–17:00"])
        self.assertEqual(schedule[2][0]["date"], "2026-09-28")
        self.assertEqual(labels(schedule, 2), ["08:00–09:00"])


if __name__ == "__main__":
    unittest.main()
