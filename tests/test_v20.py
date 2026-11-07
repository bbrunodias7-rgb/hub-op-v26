import os,sys,tempfile,unittest
sys.path.insert(0,os.path.dirname(os.path.dirname(__file__)))
class V20(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.mkdtemp();os.environ['DB_FILE']=os.path.join(self.tmp,'t.db');os.environ['HUB_ACCESS_USER']='gate';os.environ['HUB_ACCESS_PASSWORD']='x'*20
        import importlib,app;importlib.reload(app);self.app=app;app.init_db()
        self.c=app.app.test_client();import base64;self.h={'Authorization':'Basic '+base64.b64encode(b'gate:'+b'x'*20).decode()}
        with app.get_db() as con:
            con.execute("INSERT OR REPLACE INTO usuarios (usuario,nome,senha,acessos,cargo,favoritos) VALUES ('chefe','CHEFE','1','todos','Administrador','')")
            con.execute("INSERT OR REPLACE INTO usuarios (usuario,nome,senha,acessos,cargo,favoritos) VALUES ('Gabriel','Gabriel','1','','tl','')")
            con.execute("INSERT OR REPLACE INTO usuarios (usuario,nome,senha,acessos,cargo,favoritos) VALUES ('joao','Joao','1','','TL','')")
            con.execute("INSERT INTO colaboradores (nome,vinculo) VALUES ('ANA','REP')");con.commit()
    def login(self,u):self.assertEqual(self.c.post('/api/login',json={'usuario':u,'senha':'1'},headers=self.h).status_code,200)
    def act(self,**d):return self.c.post('/api/bases_gestao',json=d,headers=self.h)
    def test_adm_spelled_differently_builds_base_without_tl_collaborator(self):
        self.login('chefe');r=self.act(acao='criar',nome='Base G',usuario='gabriel',tl='');self.assertEqual(r.status_code,200,r.get_json())
        self.assertEqual(self.act(acao='criar',nome='Base J',usuario='joao',tl='').status_code,200)
        self.assertEqual(self.act(acao='vincular',nome='ANA',tl='GABRIEL').status_code,200)
        self.assertEqual(self.act(acao='solicitar',nome='ANA',de='GABRIEL',para='JOAO').status_code,200)
        self.login('joao')
        self.assertEqual(self.act(acao='solicitar',nome='ANA',de='JOAO',para='GABRIEL').status_code,200)
        self.login('gabriel');import json
        with self.app.get_db() as con:e=self.app.ler_estado(con.cursor())
        p=[t for t in e['transferenciasBase'] if t['status']=='Pendente'][0]
        self.assertEqual(self.act(acao='responder',id=p['id'],aprovar=True).status_code,200)
        with self.app.get_db() as con:e=self.app.ler_estado(con.cursor())
        self.assertEqual(e['bancoGestacional']['ANA'],'GABRIEL')
    def test_tl_cannot_build(self):
        self.login('joao');self.assertEqual(self.act(acao='criar',nome='X',usuario='joao').status_code,403)
if __name__=='__main__':unittest.main()
