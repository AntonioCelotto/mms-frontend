import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parents[1] / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class MaterialArticlesApiTest(unittest.TestCase):
    def setUp(self):
        self.api = load('material_articles_api', 'api/save-materials.py')
        self.order = {'id': 1172, 'source_quote_payload': {'articles': [{'id': 'shirt', 'name': 'Camicia'}, {'code': 'pants', 'name': 'Pantalone'}]}}

    def test_normalization_keeps_link_and_decimal_total(self):
        row = self.api.normalize_material({'product_name': 'Tessuto', 'article_key': 'shirt', 'article_name': 'Fake', 'quantity_required': '2,5'})
        self.api.validate_article(row, self.order)
        self.assertEqual(row['article_key'], 'shirt')
        self.assertEqual(row['article_name'], 'Camicia')
        self.assertEqual(row['quantity_required'], '2.5')
        self.assertNotIn('reserved_quantity', row)

    def test_invalid_links_and_quantities(self):
        with self.assertRaises(ValueError):
            self.api.validate_article({'article_key': 'foreign'}, self.order)
        for qty in (0, -1, 'NaN', 'Infinity', '1000000001'):
            with self.subTest(qty=qty), self.assertRaises(ValueError):
                self.api.normalize_material({'product_name': 'Tessuto', 'quantity_required': qty})
        row = self.api.normalize_material({'product_name': 'Storico'})
        self.api.validate_article(row, self.order)
        self.assertIsNone(row['article_key'])
        self.assertIsNone(row['article_name'])

    def test_invalid_request_stops_before_atomic_rpc(self):
        with patch.object(self.api, 'require_access', return_value=True), patch.object(self.api, 'resolve_order_for_materials', return_value=self.order), \
             patch.object(self.api, 'read_json_body', return_value={'materials': [{'product_name': 'Tessuto', 'article_key': 'foreign'}]}), \
             patch.object(self.api, 'supabase_request') as save, patch.object(self.api, 'write_json') as write:
            self.api.handler.do_POST(object())
            save.assert_not_called()
            self.assertEqual(write.call_args.args[2], 400)

    def test_old_client_cannot_clear_saved_article_links(self):
        with patch.object(self.api, 'require_access', return_value=True), patch.object(self.api, 'resolve_order_for_materials', return_value=self.order), \
             patch.object(self.api, 'read_json_body', return_value={'materials': [{'product_name': 'Tessuto'}]}), \
             patch.object(self.api, 'fetch_table', return_value=[{'id': 10, 'article_key': 'shirt'}]), \
             patch.object(self.api, 'supabase_request') as save, patch.object(self.api, 'write_json') as write:
            self.api.handler.do_POST(object())
            save.assert_not_called()
            self.assertEqual(write.call_args.args[2], 409)


class QueueAssignmentApiTest(unittest.TestCase):
    def setUp(self):
        self.api = load('queue_assignment_api', 'api/assign-task.py')
        self.payload = {'task_id': 4000, 'only_if_unassigned': True, 'assigned_user_id': 20,
                        'external_supplier_name': None, 'planned_date': '2026-11-17 08:00'}
        self.current = {'id': 4000, 'assigned_user_id': None, 'external_supplier_name': None,
                        'status': 'da_avviare', 'updated_at': '2026-11-17T08:00:00+00:00', 'quantity': 10, 'unit_hours': 7, 'estimated_hours': 70}

    def run_request(self, rows=None, current=None, payload=None):
        def fetch(table, **kwargs):
            return [current or self.current] if table == 'order_tasks' else [{'id': 20, 'is_active': True}]
        with patch.object(self.api, 'require_access', return_value=True), patch.object(self.api, 'read_json_body', return_value=payload or self.payload), \
             patch.object(self.api, 'fetch_table', side_effect=fetch), patch.object(self.api, 'patch_rows', return_value=rows if rows is not None else [self.current]) as update, \
             patch.object(self.api, 'write_json') as write:
            self.api.handler.do_PATCH(object())
            return update, write

    def test_compare_and_set_keeps_duration_and_article(self):
        update, _ = self.run_request()
        args = update.call_args.kwargs
        self.assertEqual(args['filters']['assigned_user_id'], 'is.null')
        self.assertEqual(args['filters']['updated_at'], 'eq.2026-11-17T08:00:00+00:00')
        self.assertEqual(args['payload'], {'assigned_user_id': 20, 'external_supplier_name': None, 'planned_date': '2026-11-17 08:00'})

    def test_already_assigned_or_raced_returns_conflict(self):
        update, write = self.run_request(current={**self.current, 'assigned_user_id': 22})
        update.assert_not_called()
        self.assertEqual(write.call_args.args[2], 409)
        update, write = self.run_request(rows=[])
        self.assertEqual(write.call_args.args[2], 409)

    def test_cannot_change_other_fields_or_invalid_dates(self):
        for extra in ({'estimated_hours': 100}, {'planned_date': '2026-02-31'}, {'planned_date': ''}, {'only_if_unassigned': 'true'}):
            update, write = self.run_request(payload={**self.payload, **extra})
            update.assert_not_called()
            self.assertEqual(write.call_args.args[2], 400)

    def test_only_admin_and_active_assignees(self):
        with patch.object(self.api, 'require_access', return_value=False) as access, patch.object(self.api, 'read_json_body') as read:
            self.api.handler.do_PATCH(object())
            self.assertEqual(access.call_args.args[1], {'admin'})
            read.assert_not_called()
        with patch.object(self.api, 'require_access', return_value=True), patch.object(self.api, 'read_json_body', return_value=self.payload), \
             patch.object(self.api, 'fetch_table', side_effect=[[self.current], []]), patch.object(self.api, 'patch_rows') as update, patch.object(self.api, 'write_json') as write:
            self.api.handler.do_PATCH(object())
            update.assert_not_called()
            self.assertEqual(write.call_args.args[2], 400)


if __name__ == '__main__':
    unittest.main()
