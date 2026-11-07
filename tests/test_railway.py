import base64
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

os.environ.setdefault('HUB_ACCESS_USER', 'test-access')
os.environ.setdefault('HUB_ACCESS_PASSWORD', 'test-only-password-123456789')
os.environ.setdefault('HUB_ADMIN_PIN', 'test-admin-pin')
import app

class Railway(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        app.DB_FILE = str(Path(self.tmp.name) / 'volume' / 'banco_hub.db')
        app.init_db()
        self.client = app.app.test_client()
        token = base64.b64encode(b'test-access:test-only-password-123456789').decode()
        self.headers = {'Authorization': 'Basic ' + token}

    def tearDown(self):
        self.tmp.cleanup()

    def test_every_operational_endpoint_blocks_anonymous_requests(self):
        for rule in app.app.url_map.iter_rules():
            if rule.rule == '/health':
                continue
            for method in rule.methods - {'OPTIONS', 'HEAD'}:
                with self.subTest(path=rule.rule, method=method):
                    self.assertEqual(self.client.open(rule.rule.replace('<path:filename>', 'script.js'), method=method).status_code, 401)

    def test_access_fails_closed_when_unconfigured_or_short(self):
        for password in ('', 'short'):
            with patch.dict(os.environ, {'HUB_ACCESS_PASSWORD': password}):
                self.assertEqual(self.client.get('/', headers=self.headers).status_code, 503)
                self.assertEqual(self.client.get('/health').status_code, 503)

    def test_wrong_password_is_rejected(self):
        self.assertEqual(self.client.get('/', headers={'Authorization': 'Basic '+base64.b64encode(b'test-access:wrong').decode()}).status_code, 401)

    def test_volume_survives_database_reinitialization(self):
        self.assertEqual(self.client.post('/api/colaboradores', headers=self.headers, json={'nome':'PERSISTENTE','cargo':'REP'}).status_code, 200)
        app.init_db()
        self.assertEqual(self.client.get('/api/dados_completos', headers=self.headers).json['reps'][0]['nome'], 'PERSISTENTE')
        self.assertTrue(Path(app.DB_FILE).is_file())

    def test_health_without_auth_and_authenticated_frontend(self):
        self.assertEqual(self.client.get('/health').json['status'], 'ok')
        self.assertEqual(self.client.get('/', headers=self.headers).status_code, 200)
        self.assertEqual(self.client.get('/static/script.js', headers=self.headers).status_code, 200)

    def test_cross_origin_writes_blocked(self):
        self.assertEqual(self.client.post('/api/estado_coletivo', json={}, headers={**self.headers, 'Origin':'https://other.invalid'}).status_code, 403)

    def test_initial_admin_pin_comes_from_environment(self):
        with app.get_db() as conn:
            self.assertEqual(conn.execute('SELECT senha FROM usuarios WHERE usuario=?', ('brunreis',)).fetchone()['senha'], 'test-admin-pin')

    def test_gunicorn_uses_railway_port_and_single_worker(self):
        spec = importlib.util.spec_from_file_location('hub_gunicorn', Path(__file__).resolve().parents[1] / 'gunicorn.conf.py')
        with patch.dict(os.environ, {'PORT':'9123'}):
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
        self.assertEqual(module.bind, '0.0.0.0:9123')
        self.assertEqual(module.workers, 1)

if __name__ == '__main__':
    unittest.main()