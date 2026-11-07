const a=require('assert'),e=require('../static/labor-engine.js');
const old=[{rep2:'L',reps:['A'],nomeVeiculo:'Antigo',tipoVeiculo:'Truck'}];
const migrated=e.migrateVehicles(old);a.equal(migrated[0].veiculos[0].nome,'Antigo');a.deepEqual(e.migrateVehicles(migrated),migrated);
migrated[0].veiculos.push({id:'NEW',nome:'Segundo',status:'Finalizado'});const vs=e.flattenVehicles(migrated);a.equal(vs.length,2);a.equal(vs[0].vaga,vs[1].vaga);a.notEqual(vs[0].id,vs[1].id);a.equal(vs[1].status,'Finalizado');
const cs=[{nome:'A',cargo:'REP',pls_aduana:95},{nome:'L',cargo:'REP II',pls_aduana:70},{nome:'B',cargo:'REP',pls_aduana:80}];const before=JSON.stringify(cs);const p=e.plan(cs,[{key:'0',metric:'pls_aduana',leader:true},{key:'1',metric:'pls_aduana'},{key:'2',metric:'pls_aduana',occupied:true}]);a.deepEqual(p.map(x=>x.nome),['L','A']);a.equal(JSON.stringify(cs),before);
const dirs=e.directions(cs,[{menu:'xpt',label:'XPT',metric:'pls_aduana',count:1},{menu:'receb',label:'Receb',metric:'pls_aduana',count:1}]);a.equal(dirs.length,2);a.equal(new Set(dirs.map(x=>x.nome)).size,2);
console.log('v25: migration, multi-vehicle, independent statuses, PLS ranking, leader, occupied slot, preview purity, exclusive directions OK');
