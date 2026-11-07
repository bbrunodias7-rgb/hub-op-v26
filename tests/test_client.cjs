const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({console,document:{addEventListener(){}},setTimeout(){},Set,Map});
vm.runInContext(fs.readFileSync(__dirname+'/../static/script.js','utf8'),ctx);
vm.runInContext(`
salvarEstadoColetivoSQLite=()=>Promise.resolve();renderizarTelaAtiva=()=>{};
`,ctx);
function test(name,body){vm.runInContext('{'+body+'}',ctx);console.log('PASS',name)}
ctx.assert=assert;
test('fixed 99.13% target and exact boundaries',`assert.equal(META_POKA_YOKE,99.13);assert.equal(classeMetaPoka('99,12%'),'meta-abaixo');assert.equal(classeMetaPoka('99,13%'),'meta-atingida');assert.equal(classeMetaPoka('100%'),'meta-atingida');`);
test('PLS radar changes from raw imports',`bancoDadosReps=[{nome:'A',pls_bancada:'500'},{nome:'B',pls_bancada:'1000'}];assert.equal(comprimentoRadarPLS(bancoDadosReps[0],'bancada'),10);bancoDadosReps[0].pls_bancada='1000';assert.equal(comprimentoRadarPLS(bancoDadosReps[0],'bancada'),20);`);
test('route status distinct states',`assert.ok(iconeStatusRota('EXPEDIDA').includes('status-expedida'));assert.ok(iconeStatusRota('EM_VAGA').includes('status-em-vaga'));assert.ok(iconeStatusRota('PENDENTE').includes('status-pendente'));`);
test('allocate all incl idle, induction and support; preserve existing and other labor',`
submenuAtual='lab_esteira';estadoColetivo.labEsteira=criarEstruturaEsteiraIlhasPadrao();estadoColetivo.repsEstado={};bancoDadosReps=[];
for(let i=0;i<70;i++){let nome='REP '+i;bancoDadosReps.push({nome,pls_bancada:i,pls_sorting:70-i,aval_nao_sist:i});estadoColetivo.repsEstado[nome]={statusPresenca:'Presente',atividadesDirecionadas:['Esteira']};}
estadoColetivo.labEsteira.bancadas6[0].inducao=['REP 0'];
estadoColetivo.repsEstado['OUTRA']={labor:'lab_auditoria',statusPresenca:'Presente',atividadesDirecionadas:['Auditoria SCV']};bancoDadosReps.push({nome:'OUTRA'});
estadoColetivo.repsEstado['INTERVALO']={statusPresenca:'Ausente'};bancoDadosReps.push({nome:'INTERVALO'});
autoEscalarEsteiraAtivaPorPLS();const todos=[];estadoColetivo.labEsteira.bancadas6.forEach(b=>['inducao','bipador','etiquetador','apoio','apoioFim'].forEach(k=>todos.push(...b[k])));todos.push(...Object.values(estadoColetivo.labEsteira.golPostos).flat());estadoColetivo.labEsteira.ilhas.forEach(il=>todos.push(...il.sorting,...il.pesca));
assert.equal(todos.length,70);assert.equal(new Set(todos).size,70);assert.equal(estadoColetivo.labEsteira.bancadas6[0].inducao[0],'REP 0');assert.ok(estadoColetivo.labEsteira.bancadas6[1].inducao.length);assert.ok(estadoColetivo.labEsteira.bancadas6[0].apoio.length);assert.ok(!todos.includes('OUTRA'));assert.ok(!todos.includes('INTERVALO'));assert.equal(estadoColetivo.repsEstado['REP 69'].labor,'lab_esteira');
`);
test('volumoso uses all 66 posts rather than truncated allocation',`submenuAtual='lab_vol_chao';estadoColetivo.labVolChao=criarEstruturaVolumosoChaoPadrao();bancoDadosReps=bancoDadosReps.slice(0,60);bancoDadosReps.forEach(c=>estadoColetivo.repsEstado[c.nome]={statusPresenca:'Presente',atividadesDirecionadas:['Volumoso']});autoEscalarVolumosoChao();assert.equal(obterColaboradoresAlocadosNaFerramentaAtual().size,60);`);
test('clear audit leaves other labors and tasks',`confirm=()=>true;const original=JSON.stringify(estadoColetivo.labEsteira);estadoColetivo.psTarefas=[{id:1}];estadoColetivo.labAuditoria={auditoriaSVC:['REP 0'],rotasAuditadasSVC:{'REP 0':'A1'}};limparTabuleiroAuditoria();assert.deepEqual(estadoColetivo.labAuditoria.auditoriaSVC,[]);assert.deepEqual(estadoColetivo.labAuditoria.rotasAuditadasSVC,{});assert.equal(JSON.stringify(estadoColetivo.labEsteira),original);assert.equal(estadoColetivo.psTarefas.length,1);`);
test('automatic pesca limited to one REP per island in both labors and repeated runs',`
for (const menu of ['lab_esteira','lab_vol_esteira']) {
 submenuAtual=menu; const key=menu==='lab_esteira'?'labEsteira':'labVolEsteira';
 estadoColetivo[key]=criarEstruturaEsteiraIlhasPadrao(); estadoColetivo.repsEstado={};
 bancoDadosReps=Array.from({length:100},(_,i)=>({nome:'P'+i,pls_bancada:800,pls_volumoso:800,aval_nao_sist:8}));
 estadoColetivo[key].ilhas[0].pesca=['P0']; bancoDadosReps.forEach(c=>estadoColetivo.repsEstado[c.nome]={labor:menu,statusPresenca:'Presente',atividadesDirecionadas:[menu==='lab_esteira'?'Esteira':'Volumoso em Esteira']});
 for(let run=0;run<2;run++) {
  autoEscalarEsteiraAtivaPorPLS();
  assert.equal(estadoColetivo[key].ilhas[0].pesca[0],'P0');
  const nomeadas=estadoColetivo[key].ilhas.filter(il=>il.letra);
  nomeadas.forEach(il=>assert.equal(il.pesca.length,1));
  assert.equal(estadoColetivo[key].ilhas.reduce((n,il)=>n+il.pesca.length,0),nomeadas.length);
  assert.equal(obterColaboradoresAlocadosNaFerramentaAtual().size,100);
 }
}
`);
test('audit and optimization drops move person once across labors',`submenuAtual='lab_auditoria';estadoColetivo.labAuditoria={auditoriaSVC:[],otimizacaoXPT:[],movimentarSVC:[],movimentarXD:[]};estadoColetivo.repsEstado={AUD:{statusPresenca:'Presente',atividadesDirecionadas:['Auditoria SCV']}};const ev={preventDefault(){},dataTransfer:{getData(){return JSON.stringify({tipo:'REP',nome:'AUD'})}}};dropNaAuditoria(ev,'auditoriaSVC');dropNaAuditoria(ev,'otimizacaoXPT');dropNaAuditoria(ev,'otimizacaoXPT');assert.equal(estadoColetivo.repsEstado.AUD.labor,'lab_auditoria');assert.deepEqual(estadoColetivo.labAuditoria.auditoriaSVC,[]);assert.deepEqual(estadoColetivo.labAuditoria.otimizacaoXPT,['AUD']);`);
test('required 30 current 60 returns surplus 30',`assert.equal(compararHC(30,60,0,0,0).excedente,30);assert.equal(compararHC(30,60,0,0,0).deficit,0);`);
test('ABS afastados DSR deducted once and concrete deficit',`const r=compararHC(30,60,15,10,8);assert.equal(r.abs,15);assert.equal(r.afastado,10);assert.equal(r.dsr,8);assert.equal(r.disponivel,27);assert.equal(r.deficit,3);assert.equal(r.excedente,0);`);
test('HC current and absence totals read from actual roster',`bancoDadosReps=Array.from({length:60},(_,i)=>({nome:'HC'+i}));estadoColetivo.repsEstado={HC0:{statusPresenca:'Ausente'},HC1:{statusPresenca:'Afastado'},HC2:{statusPresenca:'DSR'}};const r=resumirPresencaHC();assert.equal(r.atual,60);assert.equal(r.abs,1);assert.equal(r.afastado,1);assert.equal(r.dsr,1);`);

test('v9: exactly 40 islands, 20 per side, and old per-side GOL merges into one',`
const velho={formato:'planilha',bancadas6:[{id:'LM',inducao:[],bipador:[],etiquetador:[],apoio:[],apoioFim:[],gol:['G1']},{id:'XPT',inducao:[],bipador:[],etiquetador:[],apoio:[],apoioFim:[],gol:['G2']}],ilhas:[{letra:'A',lado:'LM'}],gol:[]};
const m=migrarEsteiraParaFormatoPlanilha(velho);
assert.equal(m.ilhas.length,40);assert.equal(m.ilhas.filter(i=>i.lado==='LM').length,20);assert.equal(m.ilhas.filter(i=>i.lado==='XPT').length,20);
assert.deepEqual(m.gol,['G1','G2']);assert.equal(m.bancadas6[0].gol,undefined);
assert.equal(criarEstruturaEsteiraIlhasPadrao().ilhas.length,40);`);
test('v9: dragging an island to the other side swaps slots and keeps 20/20',`
submenuAtual='lab_esteira';estadoColetivo.labEsteira=criarEstruturaEsteiraIlhasPadrao();const e=estadoColetivo.labEsteira;
e.ilhas[0].sorting=['S1'];const nome=e.ilhas[0].letra;assert.ok(moverIlhaEsteira(0,25));
assert.equal(e.ilhas[25].letra,nome);assert.equal(e.ilhas[25].lado,'XPT');assert.deepEqual(e.ilhas[25].sorting,['S1']);
assert.equal(e.ilhas.filter(i=>i.lado==='LM').length,20);assert.equal(e.ilhas.length,40);`);
test('v9: status toggles red/yellow/green on island, bench and separation board',`
submenuAtual='lab_esteira';definirStatusOperacional('ilha:3','capotado');assert.equal(estadoColetivo.labEsteira.ilhas[3].status,'capotado');
definirStatusOperacional('ilha:3','capotado');assert.equal(estadoColetivo.labEsteira.ilhas[3].status,'');
estadoColetivo.labVolChao=criarEstruturaVolumosoChaoPadrao();definirStatusOperacional('banc:1','atencao');assert.equal(estadoColetivo.labVolChao.bancadas[1].status,'atencao');
definirStatusOperacional('sep:separadoresXPT','flow');assert.equal(estadoColetivo.labVolChao.statusSeparacao.separadoresXPT,'flow');`);
test('v9: volumoso em esteira uses belt formula; chão uses P/H rates',`
const m={bancada:1200,sorting:280,pesca:400};assert.deepEqual(calcularHCEsteira(4000,4,m),calcularHCEsteira(4000,4,m));
const r=calcularHCEsteira(4000,4,m);assert.equal(r.cadencia,1000);assert.equal(r.bancada,1);assert.equal(r.sorting,4);assert.equal(r.pesca,3);assert.equal(r.golApoio,3);assert.equal(r.total,11);
const c=calcularHCVolChao(1200,4,{onbip:100,otimizacao:50,separacao:30},5);assert.equal(c.cadencia,300);assert.equal(c.onbip,3);assert.equal(c.otimizacao,6);assert.equal(c.otimizacaoPorBancada,2);assert.equal(c.separacao,10);assert.equal(c.total,19);`);
test('v9: H/H colour follows calculator target',`estadoColetivo.calcHC={'calc-meta-ban':'1000'};const mt=metasHHDaCalculadora();assert.equal(mt.bancada,1000);assert.equal(classeMetaHH('999',mt.bancada),'meta-abaixo');assert.equal(classeMetaHH('1000',mt.bancada),'meta-atingida');assert.equal(classeMetaHH('0',mt.bancada),'');`);
test('v9: escala 5x2 feeds G&G and exports CSV',`
confirm=()=>true;renderizarEscalaTrabalho=()=>{};bancoDadosReps=[{nome:'ANA',cargo:'REP'},{nome:'BIA',cargo:'REP II'}];estadoColetivo.repsEstado={};estadoColetivo.escalaTrabalho={};
document.getElementById=id=>id==='escala-mes'?{value:'2026-02'}:null;usuarioLogado={cargo:'ADM'};estadoColetivo.basesGestao=[{tl:'TLBASE'}];estadoColetivo.bancoGestacional={ANA:'TLBASE',BIA:'TLBASE'};preConfigurarEscala5x2();
const ana=estadoColetivo.escalaTrabalho['2026-02'].ANA;assert.equal(ana.length,28);assert.equal(ana.filter(x=>x==='D').length,8);assert.equal(ana.filter(x=>x==='T').length,20);
assert.notDeepEqual(ana,estadoColetivo.escalaTrabalho['2026-02'].BIA);
definirCodigoEscala('2026-02','BIA',10,'A');aplicarEscalaNoGG('2026-02-10');assert.equal(estadoColetivo.repsEstado.BIA.statusPresenca,'Afastado');
assert.equal(estadoColetivo.repsEstado.ANA.statusPresenca,codigoEscala('2026-02','ANA',10)==='D'?'DSR':'Escalado');
const csv=gerarCSVEscala('2026-02');const l=csv.replace('\\ufeff','').split('\\r\\n');assert.equal(l[0].split(';').length,8+28+3);assert.ok(l[1].startsWith('ANA;REP;'));`);
test('v13: IDs grouped into letters; letter pushed onto island sums raw IDs, no bulky deduction',`
salvarEstadoColetivoSQLite=()=>{};renderizarTelaAtiva=()=>{};submenuAtual='lab_esteira';
alert=()=>{};estadoColetivo.letrasOtim=[];
estadoColetivo.rotasLabor=Array.from({length:10},(_,i)=>({id_otimizado:'R'+i,spr:100,lado:'LM'}));
const e=estadoColetivo.labEsteira=criarEstruturaEsteiraIlhasPadrao();obterObjetoEsteiraAtiva=()=>e;
assert.ok(criarLetraOtimizada('a'));assert.ok(criarLetraOtimizada('>A'));assert.equal(criarLetraOtimizada('A'),false);
assert.ok(colocarIdNaLetra('R0','A'));assert.ok(colocarIdNaLetra('R1','A'));assert.ok(colocarIdNaLetra('R2','A'));
assert.equal(pacotesId('R0'),100);
assert.ok(colocarLetraNaIlha('A',5));assert.equal(pacotesIlhaLabor(e.ilhas[5]),300);
assert.ok(colocarIdNaLetra('R2','>A'));assert.equal(pacotesIlhaLabor(e.ilhas[5]),200);
assert.ok(colocarLetraNaIlha('A',7));assert.equal(e.ilhas[5].letra,'');assert.equal(e.ilhas[7].letra,'A');
assert.equal(colocarIdNaLetra('NAO_EXISTE','A'),false);assert.equal(colocarLetraNaIlha('Z',0),false);`);
test('v10: pesca tripla gets one fishing post for three islands',`
salvarEstadoColetivoSQLite=()=>{};renderizarTelaAtiva=()=>{};submenuAtual='lab_esteira';
const e=estadoColetivo.labEsteira=criarEstruturaEsteiraIlhasPadrao();obterObjetoEsteiraAtiva=()=>e;
e.ilhas[1].pesca=['X1'];definirPescaGrupo(0,3);const ld=mapaPescaUnida(e);
assert.equal(ld[1],0);assert.equal(ld[2],0);assert.equal(ld[3],3);assert.deepEqual(e.ilhas[0].pesca,['X1']);assert.deepEqual(e.ilhas[1].pesca,[]);`);
test('v10: only OPS II may be scheduled in PS',`
assert.ok(ehCargoOpsII({cargo:'OPSII (PS)'}));assert.ok(ehCargoOpsII({cargo:'OPS II'}));
assert.ok(!ehCargoOpsII({cargo:'OPS III'}));assert.ok(!ehCargoOpsII({cargo:'TL'}));assert.ok(!ehCargoOpsII({cargo:'REP II'}));`);
test('v9: labor CSV has single GOL row and only named islands',`
estadoColetivo.labEsteira=criarEstruturaEsteiraIlhasPadrao();estadoColetivo.labEsteira.gol=['GOLEIRO'];const csv=gerarCSVLabors('lab_vol_chao');
assert.ok(csv.includes('GOL · Movimentadores;GOLEIRO'));assert.ok(csv.includes('LABOR VOLUMOSO EM CHÃO'));assert.ok(!csv.includes('GOL LM'));`);
test('v14: quick select moves selected IDs into a letter',`alert=()=>{};renderizarOtimizacaoLabor=()=>{};estadoColetivo.rotasLabor=[{id_otimizado:'A1',pacotes:10},{id_otimizado:'A2',pacotes:5},{id_otimizado:'A3',pacotes:7}];estadoColetivo.letrasOtim=[];criarLetraOtimizada('>A');alternarIdOtim('A1');alternarIdOtim('A3');moverSelecionadosParaLetra('>A');assert.deepEqual(letraPorNome('>A').ids,['A1','A3']);assert.equal(idsSelecionadosOtim.size,0);`);
test('v14: HC volumoso is the same volume for chao and esteira, counted once',`clearTimeout=()=>{};
const campos={'calc-vol':'1000','calc-pct-vol':'10','calc-hrs':'4','calc-hrs-trab':'0','calc-modo-vol':'chao'};const painel={innerHTML:''};
document.getElementById=id=>id==='painel-calculadora-hc'?painel:(id in campos?{value:campos[id]}:null);
estadoColetivo.calcHC={};calcularCalculadoraHC();
const h=painel.innerHTML;assert.ok(h.includes('Volumoso em Esteira • 100 pcts'));assert.ok(h.includes('Volumoso em Chão • 100 pcts'));
const e=calcularHCEsteira(900,4,{bancada:1200,sorting:280,pesca:400}).total, c=calcularHCVolChao(100,4,{onbip:280,otimizacao:150,separacao:50},5).total;
assert.ok(h.includes('<td>'+(e+c)+'</td>'));`);
test('pull request needs approval from origin labor',`usuarioLogado={nome:'OP'};abrirModalGenteGestao=()=>{};renderizarBarraPedidosApoioGG=()=>{};estadoColetivo.labEsteira=criarEstruturaEsteiraIlhasPadrao();estadoColetivo.labEsteira.ilhas[0].sorting=['Q'];estadoColetivo.repsEstado={Q:{statusPresenca:'Presente',statusOperacional:'Ocioso',labor:'lab_esteira',atividadesDirecionadas:['Esteira']}};estadoColetivo.pedidosPuxar=[];submenuAtual='lab_vol_chao';solicitarPuxarColaborador('Q');assert.equal(estadoColetivo.labEsteira.ilhas[0].sorting[0],'Q');const p=estadoColetivo.pedidosPuxar[0];assert.equal(p.deMenu,'lab_esteira');assert.equal(podeAprovarPedidoPuxar(p),false);submenuAtual='lab_esteira';assert.equal(podeAprovarPedidoPuxar(p),true);responderPedidoPuxar(p.id,true);assert.equal(estadoColetivo.repsEstado.Q.labor,'lab_vol_chao');assert.equal(estadoColetivo.labEsteira.ilhas[0].sorting.length,0);assert.equal(estadoColetivo.pedidosPuxar.length,0);`);
test('G&G location text',`estadoColetivo.labEsteira=criarEstruturaEsteiraIlhasPadrao();estadoColetivo.labEsteira.ilhas[0].sorting=['L'];estadoColetivo.repsEstado={L:{},M:{}};assert.ok(textoLocalColaborador('L').includes('Sorting: Ilha '+estadoColetivo.labEsteira.ilhas[0].letra));`);
test('Layout direction exists and Recebimento uses its own boards',`assert.ok(ATIVIDADES_DIRECIONAMENTO.processamento.includes('Layout'));submenuAtual='lab_recebimento';estadoColetivo.recebEquipes[0].reps[0]='R';assert.ok(obterColaboradoresAlocadosNaFerramentaAtual().has('R'));submenuAtual='exp_xpt';assert.ok(!obterColaboradoresAlocadosNaFerramentaAtual().has('R'));`);

test('v16: clear scale wipes only the shown month and keeps G&G statuses',`
confirm=()=>true;salvarEstadoColetivoSQLite=()=>{};renderizarEscalaTrabalho=()=>{};mesEscalaAtual=()=>'2026-02';
estadoColetivo.escalaTrabalho={'2026-01':{'ANA':['T','D']},'2026-02':{'ANA':['T','T'],'BIA':['D']}};
estadoColetivo.repsEstado={ANA:{statusPresenca:'DSR'}};estadoColetivo.escalaAplicadaEm='2026-02-03';
limparEscalaTrabalho();
assert.ok(!('2026-02' in estadoColetivo.escalaTrabalho));
assert.deepEqual(estadoColetivo.escalaTrabalho['2026-01'].ANA,['T','D']);
assert.equal(estadoColetivo.repsEstado.ANA.statusPresenca,'DSR');
assert.equal(estadoColetivo.escalaAplicadaEm,'');
`);
test('v16: cancelling the clear keeps every day of the scale',`
confirm=()=>false;mesEscalaAtual=()=>'2026-01';const antes=JSON.stringify(estadoColetivo.escalaTrabalho);
limparEscalaTrabalho();assert.equal(JSON.stringify(estadoColetivo.escalaTrabalho),antes);
`);
