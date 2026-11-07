import os,sys,unittest,json
sys.path.insert(0,os.path.dirname(__file__))
from test_v20 import V20
class V21(V20):
    def post(self,path,**d):return self.c.post(path,json=d,headers=self.h)
    def test_handover_only_adm_and_next_different_adm(self):
        self.assertEqual(self.post('/api/passagem_turno',turno='SD',observacoes='Rotas pausadas').status_code,401)
        self.login('joao');self.assertEqual(self.post('/api/passagem_turno',turno='SD',observacoes='Rotas pausadas').status_code,403)
        self.login('chefe');r=self.post('/api/passagem_turno',turno='SD',observacoes='Rotas pausadas',resumo='Teste');self.assertEqual(r.status_code,200);id=r.json['id']
        self.assertIsNone(self.c.get('/api/passagem_turno',headers=self.h).json['pendente'])
        with self.app.get_db() as con:con.execute("UPDATE usuarios SET cargo='ADM' WHERE usuario='joao'");con.commit()
        self.login('joao');self.assertEqual(self.c.get('/api/passagem_turno',headers=self.h).json['pendente']['id'],id)
        self.assertEqual(self.post('/api/passagem_turno/ciente',id=id).status_code,200)
        self.assertIsNone(self.c.get('/api/passagem_turno',headers=self.h).json['pendente'])
    def test_snapshot_cannot_erase_handover(self):
        self.login('chefe');self.post('/api/passagem_turno',turno='PM',observacoes='Avarias',resumo='Avarias')
        with self.app.get_db() as con:e=self.app.ler_estado(con.cursor())
        r=self.post('/api/estado_coletivo',versao=e['versao'],passagensTurno=[]);self.assertEqual(r.status_code,200)
        with self.app.get_db() as con:e=self.app.ler_estado(con.cursor())
        self.assertEqual(e['passagensTurno'][0]['observacoes'],'Avarias')
    def test_invalid_shift_does_not_save(self):
        self.login('chefe');self.assertEqual(self.post('/api/passagem_turno',turno='ZZ',observacoes='Teste').status_code,400)
    def test_tl_cannot_change_vehicle(self):
        self.login('joao');self.assertEqual(self.post('/api/estado_coletivo',xptEquipes=[{'nomeVeiculo':'TRUCK'}]).status_code,403)
    def test_out_of_range_lane_is_rejected(self):
        self.login('chefe');self.assertEqual(self.post('/api/estado_coletivo',vagasPista={'XD_59':{'rep':'ANA'}}).status_code,400)
if __name__=='__main__':unittest.main()
