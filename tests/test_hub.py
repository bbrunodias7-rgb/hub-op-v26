import io, os, tempfile, unittest
os.environ['HUB_ACCESS_USER']='test-access'
os.environ['HUB_ACCESS_PASSWORD']='test-only-password-123456789'
os.environ['HUB_ADMIN_PIN']='test-admin-pin'
import app
class Imports(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();app.DB_FILE=os.path.join(self.tmp.name,'test.db')
  if app.db.USANDO_POSTGRES:
   with app.get_db() as c: c.execute('DROP SCHEMA public CASCADE');c.execute('CREATE SCHEMA public')
  app.init_db();self.client=app.app.test_client()
  import base64
  self.client.environ_base['HTTP_AUTHORIZATION']='Basic '+base64.b64encode(b'test-access:test-only-password-123456789').decode()
 def tearDown(self):self.tmp.cleanup()
 def upload(self,kind,text):return self.client.post('/api/upload_csv_bruto',data={'tipo':kind,'arquivo':(io.BytesIO(text.encode()),'input.csv')})
 def state(self):return self.client.get('/api/estado_coletivo').json
 def test_imports_independent_both_orders(self):
  for first in ['rotas','expedicao']:
   second='expedicao' if first=='rotas' else 'rotas'
   files={'rotas':'Rota;Pacotes;Tipo de servico\nA1;150;LM\nB1;250;XPT','expedicao':'Rota;Pacotes;Vaga\nX9;700;04'}
   self.assertEqual(self.upload(first,files[first]).status_code,200)
   before=self.state();routes=self.client.get('/api/dados_completos').json['listaRotas']
   self.assertEqual(self.upload(second,files[second]).status_code,200)
   after=self.state()
   if first=='rotas':
    self.assertEqual(after['rotasLabor'],before['rotasLabor']);self.assertEqual(after['labEsteira'],before['labEsteira']);self.assertEqual(after['totalPacotesDiaCSV'],400)
   else:
    self.assertEqual(after['vagasPista'],before['vagasPista']);self.assertEqual(self.client.get('/api/dados_completos').json['listaRotas'],routes)
 def test_old_snapshot_cannot_overwrite_import(self):
  old=self.state();self.upload('rotas','Rota;Pacotes\nA1;150')
  self.assertEqual(self.client.post('/api/estado_coletivo',json=old).status_code,409)
  self.assertEqual(self.state()['totalPacotesDiaCSV'],150)
  fresh=self.state();fresh['psDuvidas']=[{'texto':'preservar'}]
  self.assertEqual(self.client.post('/api/estado_coletivo',json=fresh).status_code,200)
  self.assertEqual(self.state()['psDuvidas'][0]['texto'],'preservar')
 def test_pls_and_rating_import(self):
  self.upload('colaboradores','Nome;Cargo\nREP TESTE;REP')
  self.assertEqual(self.upload('matriz','Nome;PLS bancada;UNT bancada;Aval. bancada\nREP TESTE;900;120;9').status_code,200)
  r=next(x for x in self.client.get('/api/dados_completos').json['reps'] if x['nome']=='REP TESTE')
  self.assertEqual((r['pls_bancada'],r['unt_bancada'],r['aval_bancada']),('900','120','9'));self.assertEqual(r['cargo'],'REP')
 def test_invalid_file_transactional(self):
  self.upload('rotas','Rota;Pacotes\nA1;150');before=self.state()
  self.assertEqual(self.upload('rotas','Rota;Pacotes\nB1;300\nC1;invalid').status_code,400);self.assertEqual(self.state(),before)

class V15(Imports):
 def test_extra_cargo_and_5s(self):
  r=self.client.post('/api/colaboradores',json={'nome':'Ana Extra','cargo':'EXTRA'});self.assertEqual(r.status_code,200)
  app.init_db()
  reps={x['nome']:x for x in self.client.get('/api/dados_completos').json['reps']}
  self.assertEqual(reps['ANA EXTRA'].get('cargo') or reps['ANA EXTRA'].get('vinculo'),'EXTRA')
  r=self.upload('matriz','Nome;Aval. 5s\nANA EXTRA;9')
  self.assertEqual(r.status_code,200)
  reps={x['nome']:x for x in self.client.get('/api/dados_completos').json['reps']}
  self.assertEqual(reps['ANA EXTRA']['aval_5s'],'9')

if __name__=='__main__': unittest.main()
class V9(Imports):
 def test_gt_sign_keeps_islands_distinct(self):
  r=self.upload('rotas','Rota;Pacotes;Tipo de servico\nA1;100;LM\n>A1;40;LM\n>A2;5;LM')
  self.assertEqual(r.status_code,200,r.json)
  st=self.state()
  self.assertEqual({x['id_otimizado'] for x in st['rotasLabor']},{'A1','>A1','>A2'})
  for lab in ('labEsteira','labVolEsteira'):
   ilhas=st[lab]['ilhas'];self.assertEqual(len(ilhas),40)
   self.assertTrue(all(not i.get('ids') for i in ilhas))
 def test_reimport_keeps_placed_ids_and_drops_missing(self):
  self.upload('rotas','Rota;Pacotes\nB1;10\n>C1;7')
  st=self.state();il=st['labEsteira']['ilhas'][3]
  il['ids']=['B1','>C1'];il['sorting']=['ANA'];il['letra']='DUPLA'
  self.assertEqual(self.client.post('/api/estado_coletivo',json=st).status_code,200)
  self.upload('rotas','Rota;Pacotes\nB1;12\nD1;5')
  novo=self.state()['labEsteira']['ilhas'][3]
  self.assertEqual((novo['letra'],novo['ids'],novo['sorting']),('DUPLA',['B1'],['ANA']))
 def test_sql_translation_for_postgres(self):
  import db
  self.assertEqual(db.traduzir('BEGIN IMMEDIATE'),'SELECT pg_advisory_xact_lock(424242)')
  self.assertEqual(db.traduzir('INSERT OR REPLACE INTO estado_coletivo (id, pacote_json) VALUES (1, ?)'),'INSERT INTO estado_coletivo (id, pacote_json) VALUES (1, %s) ON CONFLICT (id) DO UPDATE SET pacote_json=EXCLUDED.pacote_json')
  self.assertIn('BIGSERIAL PRIMARY KEY',db.traduzir('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER)'))
  self.assertIn('ts BIGINT',db.traduzir('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER)'))
