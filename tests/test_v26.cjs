const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const E=require('../static/labor-engine.js');
for(const label of ['XPT','Recebimento']){
 const original=[{rep2:'LIDER',reps:['ANA','BRUNO','','',''],vagaCarregamento:'03',veiculos:[{id:'V1',status:'Finalizado',equipeFinalizacao:['ANA']},{id:'V2',status:'Pendente'}]}];
 const before=JSON.stringify(original),cleared=E.clearTeams(original);
 assert.equal(cleared[0].rep2,'',label);assert.deepEqual(cleared[0].reps,['','','','',''],label);
 assert.deepEqual(cleared[0].veiculos,original[0].veiculos);assert.equal(cleared[0].vagaCarregamento,'03');assert.equal(JSON.stringify(original),before);
}
const source=fs.readFileSync(require.resolve('../static/v25.js'),'utf8');
const context={window:{HubLaborEngine:E},document:{getElementById:()=>null},usuarioLogado:{cargo:'ADM'},submenuAtual:'exp_xpt',estadoColetivo:{xptEquipes:[{rep2:'A',reps:['B']}],recebEquipes:[{rep2:'C',reps:['D']}]},escapeHTML:String,confirm:()=>false,ocultarPopupRadar:()=>{},salvarEstadoColetivoSQLite:async()=>{},renderizarTelaAtiva:()=>{}};
vm.createContext(context);vm.runInContext(source,context);
(async()=>{
 await context.window.v26ClearBoards('exp_xpt');assert.equal(context.estadoColetivo.xptEquipes[0].rep2,'A');
 context.confirm=()=>true;context.usuarioLogado.cargo='REP';await context.window.v26ClearBoards('exp_xpt');assert.equal(context.estadoColetivo.xptEquipes[0].rep2,'A');
 context.usuarioLogado.cargo='ADM';await context.window.v26ClearBoards('lab_recebimento');assert.equal(context.estadoColetivo.recebEquipes[0].rep2,'C');
 await context.window.v26ClearBoards('exp_xpt');assert.equal(context.estadoColetivo.xptEquipes[0].rep2,'');assert.equal(context.estadoColetivo.recebEquipes[0].rep2,'C');
 console.log('v26: independent board clearing, confirmation, ADM guard and preserved vehicle records OK');
})().catch(e=>{console.error(e);process.exitCode=1;});