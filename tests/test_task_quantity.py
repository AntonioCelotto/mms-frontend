import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from api._task_quantity import quantity_fields
from api._task_schedule import schedule_task_segments


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parents[1] / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TaskQuantityTest(unittest.TestCase):
    def test_legacy_total_not_recalculated(self):
        self.assertEqual(quantity_fields({'estimated_hours': 7.25}), {})

    def test_total_is_computed_not_trusted(self):
        self.assertEqual(quantity_fields({'quantity': 10, 'unit_hours': 7, 'estimated_hours': 999}),
                         {'quantity': 10, 'unit_hours': 7., 'estimated_hours': 70.})
        self.assertEqual(quantity_fields({'quantity': 3, 'unit_hours': '0,1'})['estimated_hours'], .3)
        self.assertEqual(quantity_fields({'quantity': 10, 'unit_hours': 0})['estimated_hours'], 0)
        self.assertEqual(quantity_fields({'quantity': 1, 'unit_hours': '0.0000005'})['estimated_hours'], .000001)

    def test_invalid_input_is_rejected(self):
        for qty, hours in [(0, 7), (-1, 7), (1.5, 7), ('NaN', 7), (10, 'Infinity'), (1, -1), (1, ''),
                           (None, 7), (10, None), (1000000, 1000000)]:
            with self.subTest(qty=qty, hours=hours), self.assertRaises(ValueError):
                quantity_fields({'quantity': qty, 'unit_hours': hours})

    def test_create_is_single_and_authorized(self):
        api = load('quantity_create', 'api/order-task.py')
        payload = {'order_id': 1150, 'client_task_key': 'local-task-1150-manual-quantity',
                   'quantity': 10, 'unit_hours': 7, 'estimated_hours': 999}
        with patch.object(api, 'require_access', return_value=True), patch.object(api, 'read_json_body', return_value=payload), \
             patch.object(api, 'resolve_order', return_value={'id': 1172}), patch.object(api, 'default_department_id', return_value=1), \
             patch.object(api, 'create_task_once', return_value=[{'id': 4000}]) as create, patch.object(api, 'write_json'):
            api.handler.do_POST(object())
            self.assertEqual(create.call_count, 1)
            self.assertEqual(create.call_args.args[0]['estimated_hours'], 70)
            self.assertEqual(create.call_args.args[0]['quantity'], 10)
        with patch.object(api, 'require_access', return_value=False), patch.object(api, 'read_json_body') as read:
            api.handler.do_POST(object())
            read.assert_not_called()

    def test_assignment_recomputes_total_and_validates(self):
        api = load('quantity_assignment', 'api/assign-task.py')
        with patch.object(api, 'require_access', return_value=True), \
             patch.object(api, 'read_json_body', return_value={'task_id': 4000, 'quantity': 10, 'unit_hours': 7, 'estimated_hours': 999}), \
             patch.object(api, 'patch_rows', return_value=[{'id': 4000}]) as update, patch.object(api, 'write_json'):
            api.handler.do_PATCH(object())
            self.assertEqual(update.call_args.kwargs['payload'], {'quantity': 10, 'unit_hours': 7., 'estimated_hours': 70.})
        with patch.object(api, 'require_access', return_value=True), \
             patch.object(api, 'read_json_body', return_value={'task_id': 4000, 'quantity': 10}), \
             patch.object(api, 'patch_rows') as update, patch.object(api, 'write_json') as write:
            api.handler.do_PATCH(object())
            self.assertEqual(write.call_args.args[2], 400)
            update.assert_not_called()

    def test_seventy_hours_nine_days_one_task_no_double_count(self):
        row = {'id': 1, 'order_id': 1, 'assigned_user_id': 20, 'task_phase': 'confezione',
               'planned_date': '2026-11-17', **quantity_fields({'quantity': 10, 'unit_hours': 7})}
        result = schedule_task_segments([row], [{'id': 20, 'daily_work_hours': 8}])
        self.assertEqual(len(result), 1)
        self.assertEqual(len(result[1]), 9)
        self.assertEqual(sum(p['hours'] for p in result[1]), 70)
        self.assertEqual(result[1][-1], {'date': '2026-11-27', 'hours': 6., 'label': '08:00–13:00 / 14:00–15:00'})


if __name__ == '__main__':
    unittest.main()
