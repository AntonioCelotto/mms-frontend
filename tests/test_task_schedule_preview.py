"""The read-only browser warning must match the calendar's scheduling engine."""
import copy
import json
from pathlib import Path
import random
import subprocess
import unittest

from api._task_schedule import schedule_task_segments


class PreviewParityTest(unittest.TestCase):
    def test_browser_preview_matches_server_calendar(self):
        rng = random.Random(16112026)
        cases = []
        for case in range(60):
            users = [{"id": ident, "daily_work_hours": rng.choice([4, 6, 8]),
                      "is_active": not (case % 11 == 0 and ident == 23),
                      "working_days": ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi"]}
                     for ident in [20, 22, 23]]
            rows = []
            for ident in range(1, 16):
                row = {"id": ident, "order_id": rng.choice([1, 2, 10]),
                       "article_key": rng.choice(["", "article-1", "article-2"]),
                       "task_phase": rng.choice(["cartamodello", "taglio", "confezione", "controllo"]),
                       "assigned_user_id": rng.choice([20, 22, 23]),
                       "estimated_hours": rng.choice([.5, 1, 2.5, 5, 8, 12]),
                       "actual_hours": rng.choice([0, 1, 3]),
                       "status": rng.choice(["da_avviare", "in_corso", "completato"]),
                       "planned_date": rng.choice(["2026-10-26", "2026-11-16", "2026-11-17 11:30", "2026-11-20 14:00"]),
                       "due_date": rng.choice(["2026-11-17", "2026-11-20"]),
                       "sequence_order": rng.choice([0, 1, 2, 3, 4, 99])}
                rows.append(row)
            cases.append({"tasks": rows, "users": users})
        # Unplannable predecessor, invalid dates, external suppliers and inactive staff.
        cases.append({"tasks": [
            {"id": 1, "order_id": 1, "task_phase": "confezione", "assigned_user_id": 20,
             "estimated_hours": 4000, "planned_date": "2026-11-17"},
            {"id": 2, "order_id": 1, "task_phase": "controllo", "assigned_user_id": 22,
             "estimated_hours": .5, "planned_date": "2026-11-17"},
            {"id": 3, "order_id": 2, "external_supplier_name": "Fornitore", "estimated_hours": 2,
             "planned_date": "2026-11-17 12:00"},
            {"id": 4, "order_id": 3, "assigned_user_id": 20, "estimated_hours": 1,
             "planned_date": "2026-02-30"}], "users": [{"id": 20}, {"id": 22}]})
        before = copy.deepcopy(cases)
        script = "const fs=require('fs'),p=require('./app-task-schedule-preview.js');const cases=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(cases.map(c=>p.schedule(c.tasks,c.users))));"
        root = Path(__file__).resolve().parent.parent
        response = subprocess.run(["node", "-e", script], input=json.dumps(cases), text=True,
                                  capture_output=True, cwd=root, check=True, timeout=30)
        expected = [{str(k): v for k, v in schedule_task_segments(case["tasks"], case["users"]).items()} for case in cases]
        self.assertEqual(json.loads(response.stdout), expected)
        self.assertEqual(cases, before)


if __name__ == "__main__":
    unittest.main()
