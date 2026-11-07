from test_hub import Imports
import app
class BasesV18(Imports):
 def setUp(self):
  super().setUp()
  with app.get_db() as c:
   for u in ['tl1','tl2','tl3']:
    c.execute('INSERT INTO usuarios(usuario,nome,senha,cargo,acessos) VALUES(?,?,?,?,?)',(u,u.upper(),'test-pin','TL','todos'))
    c.execute('INSERT INTO colaboradores(nome,vinculo) VALUES(?,?)',(u.upper(),'TL'))
   c.execute("INSERT INTO colaboradores(nome,vinculo) VALUES('REP A','REP')")
  self.login('brunreis','test-admin-pin')
 def login(self,u,p='test-pin'):self.assertEqual(self.client.post('/api/login',json={'usuario':u,'senha':p}).status_code,200)
 def action(self,**d):return self.client.post('/api/bases_gestao',json=d)
 def bases(self):
  for i in (1,2):self.assertEqual(self.action(acao='criar',nome='Base '+str(i),usuario='tl'+str(i),tl='TL'+str(i)).status_code,200)
  self.assertEqual(self.action(acao='vincular',nome='REP A',tl='TL1').status_code,200)
 def test_only_admin_can_create_and_link(self):
  self.login('tl1');self.assertEqual(self.action(acao='criar',nome='X',usuario='tl1',tl='TL1').status_code,403)
  self.assertEqual(self.action(acao='vincular',nome='REP A',tl='TL1').status_code,403)
  self.login('brunreis','test-admin-pin');self.bases()
  self.assertEqual(self.action(acao='criar',nome='X',usuario='missing',tl='TL3').status_code,400)
 def test_other_tl_approval_and_repeat_decision(self):
  self.bases();self.login('tl1');self.assertEqual(self.action(acao='solicitar',nome='REP A',de='TL1',para='TL2').status_code,200)
  id=self.state()['transferenciasBase'][0]['id'];self.assertEqual(self.state()['bancoGestacional']['REP A'],'TL1')
  self.assertEqual(self.action(acao='responder',id=id,aprovar=True).status_code,403)
  self.login('tl3');self.assertEqual(self.action(acao='responder',id=id,aprovar=True).status_code,403)
  self.login('tl2');self.assertEqual(self.action(acao='responder',id=id,aprovar=True).status_code,200)
  self.assertEqual(self.state()['bancoGestacional']['REP A'],'TL2');self.assertEqual(self.action(acao='responder',id=id,aprovar=True).status_code,409)
 def test_destination_request_source_denies_keeps_membership(self):
  self.bases();self.login('tl2');self.assertEqual(self.action(acao='solicitar',nome='REP A',de='TL1',para='TL2').status_code,200)
  id=self.state()['transferenciasBase'][0]['id'];self.login('tl1');self.assertEqual(self.action(acao='responder',id=id,aprovar=False).status_code,200)
  self.assertEqual(self.state()['bancoGestacional']['REP A'],'TL1');self.assertEqual(self.state()['transferenciasBase'][0]['status'],'Negado')
 def test_snapshot_cannot_bypass_permissions_or_erase_transfer(self):
  self.bases();st=self.state();self.login('tl1');st['bancoGestacional']={'REP A':'TL2'};st['basesGestao']=[]
  self.assertEqual(self.client.post('/api/estado_coletivo',json=st).status_code,200);self.assertEqual(self.state()['bancoGestacional']['REP A'],'TL1');self.assertEqual(len(self.state()['basesGestao']),2)
 def test_metrics_only_raw_import_and_no_passwords_disclosed(self):
  self.assertEqual(self.client.post('/api/atualizar_pls_contextual',json={'nome':'REP A','posto_tipo':'sorting','pls':'50'}).status_code,403)
  self.assertEqual(self.upload('matriz','Nome;PLS sorting\nREP A;50').status_code,200)
  self.assertEqual(self.client.get('/api/dados_completos').json['reps'][0]['pls_sorting'],'50')
  self.assertTrue(all('senha' not in u for u in self.client.get('/api/usuarios').json))
