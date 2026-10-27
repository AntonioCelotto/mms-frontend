import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('task_identity', Path(__file__).resolve().parents[1] / 'api/order-task.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)

class TaskIdentityTest(unittest.TestCase):
    def test_atomic_insert_does_not_overwrite_replayed_task(self):
        row = {'order_id': 1168, 'estimated_hours': 8}
        with patch.object(api, 'supabase_request', return_value=[]) as request, \
             patch.object(api, 'fetch_table', return_value=[{'id': 2901, 'estimated_hours': 5}]) as read:
            result = api.create_task_once(row, 'local-task-1146-manual-test')
            self.assertEqual(result[0]['estimated_hours'], 5)
            self.assertEqual(request.call_args.kwargs['prefer'], 'resolution=ignore-duplicates,return=representation')
            self.assertEqual(request.call_args.kwargs['query']['on_conflict'], 'order_id,client_task_key')
            self.assertEqual(read.call_args.kwargs['filters']['order_id'], 'eq.1168')
    def test_old_page_is_rejected_before_creating_duplicates(self):
        with patch.object(api, 'require_access', return_value=True), \
             patch.object(api, 'read_json_body', return_value={'order_id':1168}), \
             patch.object(api, 'write_json') as write, patch.object(api, 'resolve_order') as resolve:
            api.handler.do_POST(object())
            self.assertEqual(write.call_args.args[2], 409)
            resolve.assert_not_called()
    def test_auth_and_validation(self):
        with patch.object(api, 'require_access', return_value=False), patch.object(api, 'read_json_body') as read:
            api.handler.do_POST(object()); read.assert_not_called()
        for value in ['NaN','Infinity','-1']:
            self.assertIsNone(api.parse_hours(value))
        self.assertEqual(api.parse_hours('0'),0)
        self.assertEqual(api.sequence_for_phase('controllo'),4)
