const fs=require('fs');const src=fs.readFileSync(__dirname+'/../static/script.js','utf8');
const m=src.match(/const CARGOS_LIDERANCA=.*\nfunction podeOcuparPosto.*\n/);eval(m[0]);
const assert=require('assert');
for(const c of ['OPSII (PS)','OPS III','TL'])assert.strictEqual(podeOcuparPosto({cargo:c}),false,c);
for(const c of ['REP','REP II','EXTRA'])assert.strictEqual(podeOcuparPosto({cargo:c}),true,c);
console.log('v22 cjs ok');
