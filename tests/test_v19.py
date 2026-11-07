import os,base64,tempfile,importlib,unittest
class AdminAccess(unittest.TestCase):
    def test_admin_recupera_acesso(self):
        os.environ.update(DB_FILE=tempfile.mktemp(suffix='.db'),HUB_ADMIN_PIN='1234',HUB_ACCESS_USER='u',HUB_ACCESS_PASSWORD='abcdefghijklmnopq')
        import app; importlib.reload(app)
        cn=app.get_db(); cn.execute("UPDATE usuarios SET usuario='BrunReis',cargo='tl',senha='x'"); cn.commit(); cn.close()
        app.init_db()
        h={'Authorization':'Basic '+base64.b64encode(b'u:abcdefghijklmnopq').decode()}
        r=app.app.test_client().post('/api/login',json={'usuario':'brunreis','senha':'1234'},headers=h)
        self.assertEqual(r.json['usuario']['cargo'],'ADM')
