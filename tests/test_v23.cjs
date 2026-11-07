const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/../static/v23.js','utf8');
const el=()=>({classList:{add(){},remove(){},toggle(){}},style:{},dataset:{},addEventListener(){},querySelector(){return null},querySelectorAll(){return []},appendChild(){},insertAdjacentHTML(){}});
const ctx={console,setInterval(){},setTimeout(){},localStorage:{getItem(){return null},setItem(){}},sessionStorage:{getItem(){return null},setItem(){}},
 document:{readyState:'complete',getElementById(){return null},querySelector(){return null},querySelectorAll(){return []},addEventListener(){},createElement:el,body:el()},
 bancoDadosReps:[{nome:'Ana',cargo:'REP II',aval_sorting:'4',pls_sorting:'90'},{nome:'Bia',cargo:'REP',aval_sorting:'9',pls_sorting:'120'},{nome:'Caio',cargo:'EXTRA',pls_sorting:'0'}],
 numMatriz:v=>{const n=parseFloat(String(v??'').replace(',','.'));return isNaN(n)?0:n},estadoColetivo:{repsEstado:{},labEsteira:{ilhas:[]}},submenuAtual:'lab_esteira',
 obterPoolEquipaMenuAtual:()=>[{nome:'Ana'},{nome:'Bia'}],obterColaboradoresAlocadosNaFerramentaAtual:()=>[]};
ctx.window=ctx;let alocou=false;ctx.autoEscalarEsteiraAtivaPorPLS=()=>{alocou=true};
vm.createContext(ctx);vm.runInContext(src,ctx);
// Cores do briefing por cargo
assert.strictEqual(ctx.corCargoBriefing('REP II'),'#2563eb');
assert.strictEqual(ctx.corCargoBriefing('OPS II'),'#16a34a');
assert.strictEqual(ctx.corCargoBriefing('OPS III'),'#ea580c');
assert.strictEqual(ctx.corCargoBriefing('EXTRA'),'#dc2626');
// Alerta de risco: nota < 5 ou sem PLS
assert.strictEqual(ctx.riscoColaboradorPosto('Ana','sorting'),true);
assert.strictEqual(ctx.riscoColaboradorPosto('Bia','sorting'),false);
assert.strictEqual(ctx.riscoColaboradorPosto('Caio','sorting'),true);
// Auto-escalar apenas sugere: melhor PLS primeiro e nada alocado
const s=ctx.sugestaoPorHabilidade('lab_esteira');
assert.strictEqual(s.porPosto.sorting[0].nome,'Bia');
assert.notStrictEqual(ctx.autoEscalarEsteiraAtivaPorPLS.toString().includes('alocou'),true);
// Distintivos
assert.ok(ctx.distintivoNivel('9').includes('🥇'));assert.ok(ctx.distintivoNivel('6').includes('🥈'));assert.ok(ctx.distintivoNivel('2').includes('🥉'));
// Indicadores PS
ctx.estadoColetivo.psTarefas=[{id:1,criadoEm:0,concluidoEm:20*60000,status:'Concluída',descricao:'Ilha A'},{id:2,status:'Pendente',descricao:'x'}];
const k=ctx.indicadoresPS('');assert.strictEqual(k.resolvidas,1);assert.strictEqual(k.pendentes,1);assert.strictEqual(k.media,20);assert.strictEqual(k.sla,100);
console.log('v23 cjs ok');
