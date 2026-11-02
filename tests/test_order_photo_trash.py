import importlib.util
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def endpoint(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'api' / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class OrderPhotoTrashTests(unittest.TestCase):
    def mutation(self, action='delete', row=None, payload=None, changed=None):
        module = endpoint('update-attachment')
        row = row or {'id': 42, 'order_id': 1200, 'file_type': 'foto', 'file_name': 'photo.jpg', 'deleted_at': None}
        payload = payload or {'order_id': 1200, 'attachment_id': 42, 'action': action}
        calls = []

        def fetch(table, **kwargs):
            calls.append(kwargs)
            return [row] if 'id' in kwargs['filters'] else [{'id': 99}]

        with patch.object(module, 'require_access', return_value={'id': 12, 'access_profile': 'admin'}), \
             patch.object(module, 'read_json_body', return_value=payload), \
             patch.object(module, 'fetch_table', side_effect=fetch), \
             patch.object(module, 'patch_rows', return_value=changed if changed is not None else [dict(row, deleted_at='new-state')]) as update, \
             patch.object(module, 'write_json') as write:
            module.handler.do_POST(SimpleNamespace())
        return update, write.call_args.args, calls

    def test_delete_only_changes_the_selected_order_photo_metadata(self):
        update, response, reads = self.mutation()
        self.assertEqual(response[1]['active_count'], 1)
        self.assertEqual(update.call_args.args, ('attachments',))
        self.assertEqual(update.call_args.kwargs['filters'], {'id': 'eq.42', 'order_id': 'eq.1200', 'deleted_at': 'is.null'})
        self.assertEqual(set(update.call_args.kwargs['payload']), {'deleted_at', 'deleted_by_user_id'})
        self.assertEqual(update.call_args.kwargs['payload']['deleted_by_user_id'], 12)
        self.assertEqual(reads[-1]['filters']['deleted_at'], 'is.null')

    def test_restore_checks_the_exact_deletion_version(self):
        row = {'id': 42, 'file_type': 'foto', 'deleted_at': '2026-11-02T10:00:00+00:00'}
        payload = {'order_id': 1200, 'attachment_id': 42, 'action': 'restore', 'expected_deleted_at': row['deleted_at']}
        update, response, _ = self.mutation(row=row, payload=payload)
        self.assertIsNone(update.call_args.kwargs['payload']['deleted_at'])
        self.assertEqual(update.call_args.kwargs['payload']['restored_by_user_id'], 12)
        self.assertEqual(update.call_args.kwargs['filters']['deleted_at'], 'eq.' + row['deleted_at'])
        payload['expected_deleted_at'] = 'stale'
        update, response, _ = self.mutation(row=row, payload=payload)
        update.assert_not_called()
        self.assertEqual(response[2], 409)

    def test_duplicate_delete_is_idempotent(self):
        row = {'id': 42, 'file_type': 'foto', 'deleted_at': '2026-11-02T10:00:00+00:00'}
        update, response, _ = self.mutation(row=row)
        update.assert_not_called()
        self.assertEqual(response[1]['attachment']['deleted_at'], row['deleted_at'])

    def test_conflicting_write_is_not_reported_as_success(self):
        update, response, _ = self.mutation(changed=[])
        self.assertEqual(response[2], 409)

    def test_only_admin_commerce_and_valid_photo_payloads_are_accepted(self):
        module = endpoint('update-attachment')
        with patch.object(module, 'require_access', return_value=None) as access, \
             patch.object(module, 'read_json_body') as body, patch.object(module, 'fetch_table') as fetch:
            module.handler.do_POST(SimpleNamespace())
            self.assertEqual(access.call_args.args[1], {'admin', 'commerce'})
            body.assert_not_called()
            fetch.assert_not_called()
        for payload in (None, {}, {'order_id': 1, 'attachment_id': -1, 'action': 'delete'},
                        {'order_id': 1, 'attachment_id': 42, 'action': 'permanent-delete'}):
            update, response, reads = self.mutation(payload=payload or {'invalid': True})
            self.assertEqual(response[2], 400)
            update.assert_not_called()
            self.assertEqual(reads, [])

    def test_other_order_or_non_photo_cannot_be_deleted(self):
        module = endpoint('update-attachment')
        with patch.object(module, 'require_access', return_value={'id': 12}), \
             patch.object(module, 'read_json_body', return_value={'order_id': 2, 'attachment_id': 42, 'action': 'delete'}), \
             patch.object(module, 'fetch_table', return_value=[]), patch.object(module, 'patch_rows') as update, \
             patch.object(module, 'write_json') as write:
            module.handler.do_POST(SimpleNamespace())
            self.assertEqual(write.call_args.args[2], 404)
            update.assert_not_called()
        update, response, _ = self.mutation(row={'id': 42, 'file_type': 'pdf'})
        self.assertEqual(response[2], 400)
        update.assert_not_called()

    def test_trash_never_receives_signed_urls_and_is_not_exposed_to_operator(self):
        module = endpoint('list-attachments')
        rows = [{'id': 1, 'file_name': 'active.jpg', 'storage_bucket': 'order-attachments', 'storage_path': 'orders/2/active.jpg'},
                {'id': 42, 'file_name': 'deleted.jpg', 'storage_bucket': 'order-attachments', 'storage_path': 'orders/2/deleted.jpg', 'deleted_at': 'now'}]
        for role in ('admin', 'commerce', 'operator'):
            with self.subTest(role=role), \
                 patch.object(module, 'require_access', return_value={'access_profile': role}), \
                 patch.object(module, 'resolve_order', return_value={'id': 2}), \
                 patch.object(module, 'profile_can_access_order', return_value=True), \
                 patch.object(module, 'fetch_table', return_value=rows), \
                 patch.object(module, 'signed_storage_url', return_value='private-link') as sign, \
                 patch.object(module, 'write_json') as write:
                module.handler.do_GET(SimpleNamespace(path='/api/list-attachments?order_id=2'))
                result = write.call_args.args[1]
                sign.assert_called_once_with('order-attachments', 'orders/2/active.jpg')
                self.assertEqual(len(result['attachments']), 1)
                self.assertEqual(result['active_count'], 1)
                self.assertEqual(len(result['deleted_attachments']), 0 if role == 'operator' else 1)
                self.assertEqual(result['hidden_photo_names'], ['deleted.jpg'])


if __name__ == '__main__':
    unittest.main()
