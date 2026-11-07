from test_v20 import V20
class V25(V20):
    def test_multiple_vehicles_same_slot_persist(self):
        self.login('chefe')
        e={'xptEquipes':[{'rep2':'','reps':[],'vagaCarregamento':'01','veiculos':[{'id':'one','nome':'Truck','status':'Pendente'},{'id':'two','nome':'Toco','status':'Finalizado'}]}]}
        self.assertEqual(self.c.post('/api/estado_coletivo',json=e,headers=self.h).status_code,200)
        read=self.c.get('/api/estado_coletivo',headers=self.h).json
        self.assertEqual(len(read['xptEquipes'][0]['veiculos']),2)
        self.assertEqual(read['xptEquipes'][0]['veiculos'][1]['status'],'Finalizado')
    def test_duplicate_vehicle_id_rejected(self):
        self.login('chefe')
        r=self.c.post('/api/estado_coletivo',json={'xptEquipes':[{'veiculos':[{'id':'a'},{'id':'a'}]}]},headers=self.h)
        self.assertEqual(r.status_code,400)
    def test_duplicate_worker_rejected(self):
        self.login('chefe')
        r=self.c.post('/api/estado_coletivo',json={'xptEquipes':[{'rep2':'ANA','reps':['ANA']}],'repsEstado':{'ANA':{'atividadesDirecionadas':['Carregamento XPT']}}},headers=self.h)
        self.assertEqual(r.status_code,400)
