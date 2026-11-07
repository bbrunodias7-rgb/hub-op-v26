// Expedition UI extension; keeps the legacy Labor banks and raw route imports.
let abaReports = 'xpt';
const reportSelecao = {};
function admPodeAlocarExpedicao() { return usuarioLogado?.cargo === 'ADM'; }
function cargoRepExpedicao(c) { return ['REP','REP II','EXTRA'].includes(String(c?.cargo || c?.vinculo || '').toUpperCase().trim()); }
function repDisponivelExpedicao(nome) { const c=bancoDadosReps.find(c=>c.nome===nome); return cargoRepExpedicao(c) && podeAlocarNaLabor(nome,submenuAtual); }
function vagaPistaValida(chave, menu) {
    const m=/^(SVC|XD)_(\d{2})$/.exec(chave); if(!m)return false;
    const n=Number(m[2]);return (m[1]==='SVC' && menu==='exp_mapa_svc' && n>=1 && n<=27) || (m[1]==='XD' && menu==='exp_mapa_xd' && n>=28 && n<=58);
}
function toastLabor(texto, erro=false) {
    let el=document.getElementById('toast-labor');if(!el){el=document.createElement('div');el.id='toast-labor';el.setAttribute('role','status');document.body.appendChild(el);}
    el.className=erro?'labor-toast erro':'labor-toast';el.textContent=texto;el.hidden=false;
    clearTimeout(el.timer);el.timer=setTimeout(()=>el.hidden=true,4500);
}
function filtrarVagasLabor(q) {
    document.querySelectorAll('#grid-vagas-pista > .doca').forEach(el=>{el.hidden=!el.textContent.toLowerCase().includes(q.toLowerCase());});
}
function selecionarRepExpedicao(chave) {
    if(!admPodeAlocarExpedicao() || !vagaPistaValida(chave,submenuAtual))return;
    const usados=obterColaboradoresAlocadosNaFerramentaAtual();
    const reps=obterPoolEquipaMenuAtual().filter(c=>cargoRepExpedicao(c)&&!usados.has(c.nome));
    let dialog=document.getElementById('dialog-rep-exp');if(dialog)dialog.remove();dialog=document.createElement('dialog');dialog.id='dialog-rep-exp';dialog.className='labor-dialog';
    dialog.innerHTML=`<div class="reports-heading"><h3>Alocar REP — ${escapeHTML(chave.replace('_',' '))}</h3><button class="btn-doca-sm" onclick="document.getElementById('dialog-rep-exp').close()" aria-label="Fechar">✕</button></div><input type="search" class="form-control" aria-label="Buscar REP" placeholder="Buscar REP" oninput="this.parentElement.querySelectorAll('[data-rep]').forEach(e=>e.hidden=!e.textContent.toLowerCase().includes(this.value.toLowerCase()))"><div class="rep-picker">${reps.map(c=>`<button class="btn-doca-sm" data-rep onclick="alocarRepEscolhido('${jsArg(chave)}','${jsArg(c.nome)}')">${escapeHTML(c.nome)} ${badgeCargo(c)}</button>`).join('')||'<p>Nenhum REP disponível neste banco.</p>'}</div>`;
    document.body.appendChild(dialog);dialog.showModal();
}
function alocarRepEscolhido(chave,nome) {
    if(!admPodeAlocarExpedicao()||!vagaPistaValida(chave,submenuAtual)||!repDisponivelExpedicao(nome))return;
    removerColaboradorDaFerramentaAtual(nome,submenuAtual);marcarOperandoAoAlocar(nome);
    const v=estadoColetivo.vagasPista[chave]||(estadoColetivo.vagasPista[chave]={rota:'',spr:0});v.rep=nome;
    document.getElementById('dialog-rep-exp')?.close();salvarEstadoColetivoSQLite().then(()=>toastLabor('REP alocado.'));renderizarTelaAtiva();
}
function veiculosCarregamento() {
    return (estadoColetivo.xptEquipes||[]).map((eq,i)=>({...eq,id: `XPT_${i+1}`,tipo:eq.tipoVeiculo||'Carreta',nome:eq.nomeVeiculo||`Veículo ${i+1}`,vaga:eq.vagaCarregamento||String(i+1).padStart(2,'0'),status:eq.statusCarregamento||'Pendente'}));
}
function renderizarCarregamentoLabor() {
    const box=document.getElementById('container-6-quadros-xpt');if(!box)return;
    const vs=veiculosCarregamento();document.getElementById('resumo-carregamento').textContent=`${vs.filter(v=>v.status==='Finalizado').length} / ${vs.length} finalizados`;
    box.innerHTML=vs.map((v,i)=>`<article class="xpt-team-card vehicle-labor ${v.status==='Finalizado'?'vehicle-done':''}"><div class="reports-heading"><h3>🚛 ${escapeHTML(v.tipo)}</h3><span class="reports-new">${escapeHTML(v.status)}</span></div><label>Veículo<input class="form-control" aria-label="Veículo ${i+1}" value="${escapeHTML(v.nome)}" onchange="salvarVeiculoLabor(${i},'nomeVeiculo',this.value)" ${admPodeAlocarExpedicao()?'':'disabled'}></label><div class="vehicle-fields"><label>Tipo<select class="form-control" aria-label="Tipo veículo ${i+1}" onchange="salvarVeiculoLabor(${i},'tipoVeiculo',this.value)" ${admPodeAlocarExpedicao()?'':'disabled'}>${['Carreta','Truck','Toco'].map(t=>`<option ${v.tipo===t?'selected':''}>${t}</option>`).join('')}</select></label><label>Vaga<input class="form-control" aria-label="Vaga carregamento ${i+1}" value="${escapeHTML(v.vaga)}" onchange="salvarVeiculoLabor(${i},'vagaCarregamento',this.value)" ${admPodeAlocarExpedicao()?'':'disabled'}></label></div><div class="vehicle-team" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="dropRepVeiculoLabor(event,${i})">${[v.rep2,...v.reps].filter(Boolean).map(n=>renderizarMiniCardAlocado(n,'aduana',`removerRepVeiculoLabor(${i},'${jsArg(n)}')`)).join('')||'<span class="sub-hint">Banco de Reps</span>'}</div><label>Status<select class="form-control" aria-label="Status veículo ${i+1}" onchange="salvarVeiculoLabor(${i},'statusCarregamento',this.value)" ${admPodeAlocarExpedicao()?'':'disabled'}>${['Pendente','Em carregamento','Finalizado'].map(t=>`<option ${v.status===t?'selected':''}>${t}</option>`).join('')}</select></label></article>`).join('');
}
function salvarVeiculoLabor(i,campo,valor) {
    if(!admPodeAlocarExpedicao())return;
    const eq=estadoColetivo.xptEquipes[i];if(!eq)return;
    if(campo==='tipoVeiculo'&&!['Carreta','Truck','Toco'].includes(valor))return;
    if(campo==='statusCarregamento'&&!['Pendente','Em carregamento','Finalizado'].includes(valor))return;
    eq[campo]=String(valor).trim();eq.atualizadoEm=new Date().toISOString();eq.responsavel=usuarioLogado.usuario;
    if(campo==='statusCarregamento'&&valor==='Finalizado'){eq.finalizadoEm=eq.atualizadoEm;eq.equipeFinalizacao=[eq.rep2,...eq.reps].filter(Boolean);}
    salvarEstadoColetivoSQLite().then(()=>toastLabor('Veículo atualizado.'));renderizarCarregamentoLabor();
}
function dropRepVeiculoLabor(ev,i) {
    const d=lerDrag(ev);if(!admPodeAlocarExpedicao()||d.tipo!=='REP'||!repDisponivelExpedicao(d.nome))return;
    const eq=estadoColetivo.xptEquipes[i];if(!eq)return;
    if(eq.statusCarregamento==='Finalizado'){toastLabor('Reabra o carregamento antes de alterar a equipe.',true);return;}
    if(!eq.rep2){dropRepXPT({preventDefault(){},dataTransfer:ev.dataTransfer},i,'rep2');return;}
    const j=eq.reps.findIndex(n=>!n || n===d.nome);if(j<0){toastLabor('Equipe completa.',true);return;}dropRepXPT({preventDefault(){},dataTransfer:ev.dataTransfer},i,j);
}
function removerRepVeiculoLabor(i,nome) {
    if(!admPodeAlocarExpedicao())return;const e=estadoColetivo.xptEquipes[i];if(!e)return;
    if(e.statusCarregamento==='Finalizado'){toastLabor('Reabra o carregamento antes de alterar a equipe.',true);return;}
    if(e.rep2===nome)e.rep2='';e.reps=e.reps.map(n=>n===nome?'':n);salvarEstadoColetivoSQLite();renderizarTelaAtiva();
}
function dataReportHoje(agora=new Date()) { return agora.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}); }
function textoReportXPT(turno,data,veiculos) {
    const carregados=veiculos.filter(v=>v.selecao==='Finalizado').map(v=>`✅ ${v.nome}: Finalizado!`);
    const pendentes=veiculos.filter(v=>v.selecao==='Pendente').map(v=>`⚠️ ${v.nome}: ${v.motivo}`);
    return `Report Xpt's ${turno} - ${data}\n\nVEÍCULOS CARREGADOS\n${carregados.join('\n')}\n\nVEÍCULO NÃO CARREGADO\n${pendentes.join('\n')}\n\nObservação: Não ficou nenhum caminhão aguardando em vaga.`;
}
function mudarAbaReports(aba) {
    abaReports=aba;for(const a of ['xpt','handover']){document.getElementById('reports-'+a).hidden=a!==aba;document.getElementById('report-tab-'+a).setAttribute('aria-selected',a===aba);document.getElementById('report-tab-'+a).classList.toggle('ativo',a===aba);}atualizarPreviewReports();
}
function renderizarCentralReports() {
    document.getElementById('report-data').textContent=dataReportHoje();
    const box=document.getElementById('reports-veiculos');
    const assinatura=JSON.stringify(veiculosCarregamento().map(v=>[v.id,v.nome,v.tipo,v.status]));
    if(box.dataset.assinatura!==assinatura){box.dataset.assinatura=assinatura;box.innerHTML=veiculosCarregamento().map((v,i)=>{if(!reportSelecao[v.id])reportSelecao[v.id]={selecao:v.status==='Finalizado'?'Finalizado':'',motivo:''};const r=reportSelecao[v.id];return `<div class="report-vehicle-row"><b>${escapeHTML(v.nome)} · ${escapeHTML(v.tipo)}</b><select class="form-control" aria-label="Report veículo ${i+1}" onchange="reportSelecao['${v.id}'].selecao=this.value;atualizarPreviewReports()"><option value="">Não incluir</option>${['Finalizado','Pendente'].map(t=>`<option ${r.selecao===t?'selected':''}>${t}</option>`).join('')}</select><input type="text" class="form-control" aria-label="Motivo pendente ${i+1}" placeholder="Motivo do pendente" value="${escapeHTML(r.motivo)}" oninput="reportSelecao['${v.id}'].motivo=this.value;atualizarPreviewReports()"></div>`;}).join('');}
    const hist=(estadoColetivo.passagensTurno||[]).slice(-5).reverse();document.getElementById('historico-passagens').innerHTML=hist.map(h=>`<article class="handover-history"><b>${escapeHTML(h.turno)} · ${escapeHTML(h.data)} · ${escapeHTML(h.autor)}</b><p>${escapeHTML(h.observacoes)}</p></article>`).join('');
    atualizarPreviewReports();
}
function dadosReportSelecionados() {return veiculosCarregamento().map(v=>({nome: `${v.nome} (${v.tipo})`,...reportSelecao[v.id]}));}
function resumoTurnoLabor() {
    const turno=document.getElementById('report-turno').value;
    return `Passagem de Turno Expedição ${turno} - ${dataReportHoje()}\n\n${textoReportXPT(turno,dataReportHoje(),dadosReportSelecionados()).split('\n\n').slice(1,-1).join('\n\n')}\n\nObservações para o próximo turno:\n${document.getElementById('report-observacoes').value.trim()||'Sem observações.'}`;
}
function atualizarPreviewReports() {
    const prev=document.getElementById('report-preview');if(!prev)return;
    prev.textContent=textoReportXPT(document.getElementById('report-turno').value,dataReportHoje(),dadosReportSelecionados());
    document.querySelectorAll('#reports-veiculos .report-vehicle-row').forEach((el,i)=>{const v=veiculosCarregamento()[i];const input=el.querySelector('input');input.disabled=reportSelecao[v.id]?.selecao!=='Pendente';});
    document.getElementById('handover-preview').textContent=resumoTurnoLabor();
}
async function copiarTextoLabor(texto) {
    try{if(!navigator.clipboard?.writeText)throw Error('Clipboard indisponível');await navigator.clipboard.writeText(texto);toastLabor('Report copiado para o WhatsApp.');}
    catch{toastLabor('Não foi possível copiar. Selecione o texto do report e copie manualmente.',true);}
}
function validarReportLabor() {
    const vs=dadosReportSelecionados();if(!vs.some(v=>v.selecao)){toastLabor('Selecione ao menos um veículo.',true);return false;}
    if(vs.some(v=>v.selecao==='Pendente'&&!v.motivo.trim())){toastLabor('Informe o motivo de cada veículo pendente.',true);return false;}return true;
}
function copiarReportXPT() {if(validarReportLabor())return copiarTextoLabor(document.getElementById('report-preview').textContent);}
function copiarResumoTurno() {return copiarTextoLabor(resumoTurnoLabor());}
async function finalizarTurnoLabor() {
    if(!admPodeAlocarExpedicao())return;const obs=document.getElementById('report-observacoes').value.trim();if(!obs){toastLabor('Preencha as observações do próximo turno.',true);return;}
    const btn=document.getElementById('btn-finalizar-turno');btn.disabled=true;
    try{await filaSalvamento;const r=await fetch('/api/passagem_turno',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({turno:document.getElementById('report-turno').value,observacoes:obs,resumo:resumoTurnoLabor()})});const d=await r.json();if(!r.ok)throw Error(d.msg||'Erro ao salvar');document.getElementById('report-observacoes').value='';await sincronizarDadosCompletos();toastLabor('Turno salvo. O próximo ADM receberá o aviso.');}
    catch(e){toastLabor(e.message,true);}finally{btn.disabled=false;}
}
async function verificarPassagemTurno() {
    if(!admPodeAlocarExpedicao())return;
    const r=await fetch('/api/passagem_turno');if(!r.ok)return;const d=await r.json();if(!d.pendente)return;
    const h=d.pendente;let el=document.createElement('dialog');el.className='labor-dialog';el.id='aviso-passagem';
    el.innerHTML=`<h3>Passagem de turno — ${escapeHTML(h.turno)}</h3><p>${escapeHTML(h.autor)} · ${escapeHTML(h.data)}</p><pre class="report-preview">${escapeHTML(h.resumo)}</pre><button class="btn-primary-full" id="btn-ciente-passagem">✓ Ciente</button>`;document.body.appendChild(el);el.showModal();
    el.querySelector('button').onclick=async()=>{const r=await fetch('/api/passagem_turno/ciente',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:h.id})});if(r.ok){el.close();el.remove();}else toastLabor('Não foi possível confirmar a leitura.',true);};
}
