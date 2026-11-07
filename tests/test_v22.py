import os,sys,unittest
sys.path.insert(0,os.path.dirname(__file__))
from test_v20 import V20
class V22(V20):
    def test_adm_edits_and_deletes_base(self):
        self.login('chefe');self.act(acao='criar',nome='Base G',usuario='gabriel',tl='')
        self.act(acao='vincular',nome='ANA',tl='GABRIEL')
        self.assertEqual(self.act(acao='editar',tl='GABRIEL',nome='Base Nova',usuario='joao').status_code,200)
        with self.app.get_db() as con:e=self.app.ler_estado(con.cursor())
        self.assertEqual((e['basesGestao'][0]['nome'],e['basesGestao'][0]['usuario']),('Base Nova','joao'))
        self.assertEqual(self.act(acao='excluir',tl='GABRIEL').status_code,200)
        with self.app.get_db() as con:e=self.app.ler_estado(con.cursor())
        self.assertEqual(e['basesGestao'],[]);self.assertNotIn('ANA',e['bancoGestacional'])
    def test_tl_cannot_edit_base(self):
        self.login('chefe');self.act(acao='criar',nome='Base G',usuario='gabriel',tl='')
        self.login('gabriel');self.assertEqual(self.act(acao='editar',tl='GABRIEL',nome='X',usuario='gabriel').status_code,403)
    def test_rename_collaborator_does_not_duplicate(self):
        r=self.c.post('/api/colaboradores',json={'nome':'ANA SILVA','cargo':'REP','nome_original':'ANA'},headers=self.h)
        self.assertEqual(r.status_code,200)
        with self.app.get_db() as con:nomes=[x[0] for x in con.execute('SELECT nome FROM colaboradores')]
        self.assertEqual(nomes,['ANA SILVA'])
del V20
if __name__=='__main__':unittest.main()
