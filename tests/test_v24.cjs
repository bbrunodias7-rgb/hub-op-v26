const assert=require('assert');
global.window={};global.document={addEventListener(){},querySelectorAll:()=>[]};global.setInterval=()=>0;global.localStorage={getItem:()=>null};
const m=require('../static/v24.js');
const banco=[{nome:'A',unt_volumoso:100,pls_volumoso:100},{nome:'B',unt_volumoso:50,pls_volumoso:'100'}];
assert.strictEqual(m.tempoPrevistoMin(300,['A','B'],'Volumoso',banco),120);
assert.strictEqual(m.tempoPrevistoMin(150,['A'],'Volumoso',banco),90);
assert.strictEqual(m.tempoPrevistoMin(75,[],'Volumoso',banco),60); // média da base
assert.strictEqual(m.tempoPrevistoMin(0,['A'],'Volumoso',banco),null);
assert.strictEqual(m.statusReceb({fim:1,doca:'3'}),'FINALIZADO');
assert.strictEqual(m.statusReceb({doca:'3'}),'DOCA 03');
assert.strictEqual(m.statusReceb({chegada:1}),'AGUAR: DOCA');
assert.strictEqual(m.statusReceb({}),'PENDENTE');
assert.ok(m.ehPS({cargo:'OPSII'}));assert.ok(!m.ehPS({cargo:'TL'}));assert.ok(!m.ehPS({cargo:'ADM'}));
assert.ok(m.podeEditarPOPs({cargo:'OPSII'}));assert.ok(!m.podeEditarPOPs({cargo:'REP'}));
console.log('v24 ok');
