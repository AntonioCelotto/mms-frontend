import copy
import importlib
import unittest
from unittest.mock import patch


class ScheduleBootstrapTest(unittest.TestCase):
    def test_shared_schedule_reaches_admin_commerce_and_filtered_operator_views(self):
        tables = {
            "orders": [{"id": 1, "order_number": "1199", "client_id": 1, "category": "Sartoria interna"},
                       {"id": 2, "order_number": "1180", "client_id": 1, "category": "Sartoria interna"}],
            "departments": [{"id": 1, "name": "Sartoria interna"}],
            "users": [{"id": i, "is_active": True, "daily_work_hours": 8} for i in (22, 23)],
            "order_tasks": [
                {"id": 1, "order_id": 1, "article_key": "article-1", "task_phase": "cartamodello", "estimated_hours": 5,
                 "assigned_user_id": 22, "planned_date": "2026-11-05", "department_id": 1, "task_name": "Articolo 1"},
                {"id": 2, "order_id": 1, "article_key": "article-2", "task_phase": "cartamodello", "estimated_hours": .5,
                 "assigned_user_id": 22, "planned_date": "2026-10-29", "department_id": 1, "task_name": "Articolo 2"},
                {"id": 3, "order_id": 1, "article_key": "article-2", "task_phase": "controllo", "estimated_hours": .5,
                 "assigned_user_id": 23, "planned_date": "2026-10-29", "department_id": 1, "task_name": "Controllo articolo 2"},
                {"id": 4, "order_id": 2, "task_phase": "taglio", "estimated_hours": 9,
                 "assigned_user_id": 22, "planned_date": "2026-10-28", "department_id": 1, "task_name": "Altro ordine"},
            ],
        }
        before = copy.deepcopy(tables)
        for name in ("_supabase", "api._supabase"):
            module = importlib.import_module(name)
            with patch.object(module, "fetch_table", side_effect=lambda table, **kw: tables.get(table, [])):
                admin = module.build_bootstrap({"access_profile": "admin"})
                commerce = module.build_bootstrap({"access_profile": "commerce"})
                operator = module.build_bootstrap({"access_profile": "operator", "id": 23})
            self.assertEqual(admin["calendarTaskSlots"], commerce["calendarTaskSlots"])
            self.assertEqual(admin["calendarTaskSlots"]["2"]["segments"],
                             [{"date": "2026-10-29", "hours": .5, "label": "09:00–09:30"}])
            self.assertEqual(operator["calendarTaskSlots"]["3"], admin["calendarTaskSlots"]["3"])
            self.assertEqual(operator["calendarTaskSlots"]["3"]["segments"][0]["label"], "09:30–10:00")
            self.assertEqual(set(operator["calendarTaskSlots"]), {"3"}, "Other employees' task details stay private")
            self.assertEqual(len(admin["orderTasks"]["1199"]), 3, "Bootstrap keeps canonical tasks, not daily copies")
            self.assertEqual(admin["orders"][0]["category"], "Sartoria interna")
            self.assertEqual(tables, before, "Reading a schedule never writes the requested dates or hours")
