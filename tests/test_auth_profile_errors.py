import importlib
import importlib.util
import io
import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[1]


def endpoint():
    spec = importlib.util.spec_from_file_location('auth_profile_errors_test', ROOT / 'api/auth-profile.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AuthProfileErrorTest(unittest.TestCase):
    def test_expired_or_invalid_auth_token_is_401_and_never_syncs_profile(self):
        for status in (401, 403):
            m = endpoint()
            h = SimpleNamespace(headers={'Authorization': 'Bearer expired-test-token'})
            error = HTTPError('https://example/auth/v1/user', status, 'Denied', {}, io.BytesIO(b'{"code":"bad_jwt"}'))
            with patch.object(m, 'urlopen', side_effect=error), patch.object(m, 'sync_profile') as sync, patch.object(m, 'write_json') as write:
                m.handler._handle_profile(h)
                self.assertEqual(write.call_args.args[2], 401)
                self.assertIn('Accedi nuovamente', write.call_args.args[1]['error'])
                sync.assert_not_called()

    def test_dependency_outage_is_503_not_session_expired_and_does_not_expose_details(self):
        for error in (URLError('SECRET_DIAGNOSTIC'), HTTPError('https://example', 503, 'SECRET_DIAGNOSTIC', {}, io.BytesIO(b'SECRET_DIAGNOSTIC'))):
            m = endpoint()
            h = SimpleNamespace(headers={'Authorization': 'Bearer test-user-token'})
            with patch.object(m, 'urlopen', side_effect=error), patch.object(m, 'write_json') as write:
                m.handler._handle_profile(h)
                self.assertEqual(write.call_args.args[2], 503)
                self.assertNotIn('SECRET_DIAGNOSTIC', json.dumps(write.call_args.args[1]))

    def test_inactive_stays_forbidden_and_authorized_profile_still_loads(self):
        for active, expected in ((False, 403), (True, None)):
            m = endpoint()
            with patch.object(m, 'verify_token', return_value={'id':'verified'}), patch.object(m, 'sync_profile', return_value={'is_active':active}) as sync, patch.object(m, 'write_json') as write:
                m.handler._handle_profile(SimpleNamespace())
                sync.assert_called_once()
                self.assertEqual(write.call_args.args[2] if len(write.call_args.args) > 2 else None, expected)

    def test_database_permission_failure_is_not_misclassified_as_user_token_failure(self):
        m = endpoint()
        with patch.object(m, 'verify_token', return_value={'id':'verified'}), patch.object(m, 'sync_profile', side_effect=m.UpstreamHTTPError(403)), patch.object(m, 'write_json') as write:
            m.handler._handle_profile(SimpleNamespace())
            self.assertEqual(write.call_args.args[2], 503)

    def test_missing_token_and_unexpected_errors_do_not_leak_details(self):
        m = endpoint()
        with patch.object(m, 'sync_profile') as sync, patch.object(m, 'write_json') as write:
            m.handler._handle_profile(SimpleNamespace(headers={}))
            self.assertEqual(write.call_args.args[2], 401)
            sync.assert_not_called()
        with patch.object(m, 'verify_token', side_effect=ValueError('SECRET')), patch.object(m, 'write_json') as write:
            m.handler._handle_profile(SimpleNamespace())
            self.assertEqual(write.call_args.args[2], 500)
            self.assertNotIn('SECRET', json.dumps(write.call_args.args[1]))

    def test_access_diagnostics_strip_query_and_headers_and_never_retry_writes(self):
        for name in ('_api', 'api._api'):
            m = importlib.import_module(name)
            with patch.object(m, 'urlopen', side_effect=TimeoutError('SECRET')), self.assertLogs(level='WARNING') as logs:
                with self.assertRaises(RuntimeError):
                    m._request_json('https://example/rest/v1/users?email=SECRET', headers={'Authorization':'Bearer SECRET'})
                self.assertIn('stage=access', logs.output[0])
                self.assertIn('path=/rest/v1/users', logs.output[0])
                self.assertNotIn('SECRET', logs.output[0])
        for name in ('_supabase', 'api._supabase'):
            m = importlib.import_module(name)
            with patch.object(m, 'urlopen', side_effect=TimeoutError('SECRET')) as request, self.assertLogs(level='WARNING') as logs:
                with self.assertRaises(RuntimeError):
                    m.supabase_request('/rest/v1/payments', method='POST', query={'email':'SECRET'}, payload={'note':'SECRET'})
                request.assert_called_once()
                self.assertNotIn('SECRET', logs.output[0])


if __name__ == '__main__':
    unittest.main()
