// Hub Operacional v23 — visual industrial, alertas, POPs, painel PS, briefing e inteligência.
(function () {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => (typeof escapeHTML === 'function' ? escapeHTML(String(s ?? '')) : String(s ?? ''));
const nomeArg = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// ---------- Cores por cargo (briefing) ----------
const CORES_CARGO = { 'REP II': '#2563eb', 'OPSII (PS)': '#16a34a', 'OPS II': '#16a34a', 'OPS III': '#ea580c', 'EXTRA': '#dc2626', 'TL': '#7c3aed', 'REP': '#475569' };
function cargoDe(nome) { const c = (bancoDadosReps || []).find(x => x.nome === nome); return String(c?.cargo || c?.vinculo || 'REP').trim().toUpperCase().replace('OPSII (PS)', 'OPSII (PS)'); }
function corCargo(cargo) { return CORES_CARGO[cargo] || CORES_CARGO[cargo.replace('OPSII', 'OPS II')] || CORES_CARGO.REP; }
window.corCargoBriefing = corCargo;

// ---------- Sons ----------
let audioCtx = null;
let somAtivo = localStorage.getItem('hub_som') !== '0';
function bip(freq = 880, dur = 0.15, vezes = 1, tipo = 'sine') {
  if (!somAtivo) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < vezes; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = tipo; o.frequency.value = freq; o.connect(g); g.connect(audioCtx.destination);
      const t = audioCtx.currentTime + i * (dur + 0.08);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.02);
    }
  } catch (e) {}
}
const SONS = { chat: () => bip(660, .12, 1), ps: () => bip(880, .14, 2), urgente: () => bip(990, .18, 3, 'square'), emergencia: () => bip(520, .35, 6, 'sawtooth') };
window.hubSom = SONS;
window.alternarSomHub = function () { somAtivo = !somAtivo; localStorage.setItem('hub_som', somAtivo ? '1' : '0'); const b = $('v23-btn-som'); if (b) b.textContent = somAtivo ? '🔊' : '🔇'; if (somAtivo) bip(700, .1); };

// ---------- Cronômetro de status ----------
const _alterarStatusOp = window.alterarStatusOperacional;
if (_alterarStatusOp) window.alterarStatusOperacional = function (nome, status) {
  const r = estadoColetivo.repsEstado?.[nome];
  if (r && r.statusOperacional !== status) r.statusDesde = Date.now();
  return _alterarStatusOp.apply(this, arguments);
};
function minutosDesde(ts) { return ts ? Math.max(0, Math.floor((Date.now() - ts) / 60000)) : null; }
function textoTempo(min) { return min == null ? '' : (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min} min`); }
const _botaoStatus = window.botaoStatusOperacional;
if (_botaoStatus) window.botaoStatusOperacional = function (nome) {
  const r = estadoColetivo.repsEstado?.[nome] || {};
  const desde = r.statusDesde || 0;
  return _botaoStatus.apply(this, arguments) + (desde ? `<small class="v23-timer" data-desde="${desde}">${textoTempo(minutosDesde(desde))}</small>` : '');
};
setInterval(() => document.querySelectorAll('.v23-timer[data-desde]').forEach(el => { el.textContent = textoTempo(minutosDesde(Number(el.dataset.desde))); }), 30000);

// ---------- Distintivos de nível + mapa de calor ----------
function nivelNota(n) { if (n >= 8) return { ic: '🥇', nome: 'Ouro', cls: 'ouro' }; if (n >= 5) return { ic: '🥈', nome: 'Prata', cls: 'prata' }; if (n > 0) return { ic: '🥉', nome: 'Bronze', cls: 'bronze' }; return null; }
window.distintivoNivel = function (nota) { const n = numMatriz(nota); const v = nivelNota(n); return v ? `<span class="v23-nivel ${v.cls}" title="Nível ${v.nome}">${v.ic}</span>` : ''; };
function aplicarMapaCalor(tabela) {
  if (!tabela) return;
  const linhas = [...tabela.querySelectorAll('tbody tr')];
  const head = [...tabela.querySelectorAll('thead th')].map(th => th.textContent.trim().toUpperCase());
  head.forEach((h, col) => {
    if (!/PLS|UNT|NOTA|AVAL|5S|%/.test(h)) return;
    const celulas = linhas.map(tr => tr.children[col]).filter(Boolean);
    const vals = celulas.map(td => numMatriz(td.textContent)).filter(v => v > 0);
    if (!vals.length) return;
    const notaCol = /NOTA|AVAL|5S/.test(h);
    const max = Math.max(...vals), min = Math.min(...vals);
    celulas.forEach(td => {
      td.classList.remove('v23-quente', 'v23-medio', 'v23-frio');
      const v = numMatriz(td.textContent); if (!v) return;
      let classe;
      if (notaCol) classe = v >= 8 ? 'v23-quente' : v >= 5 ? 'v23-medio' : 'v23-frio';
      else { const p = max === min ? 1 : (v - min) / (max - min); classe = p >= .66 ? 'v23-quente' : p >= .33 ? 'v23-medio' : 'v23-frio'; }
      td.classList.add(classe);
      if (notaCol && !td.querySelector('.v23-nivel')) td.insertAdjacentHTML('beforeend', ' ' + window.distintivoNivel(v));
    });
  });
}
const _renderTalentos = window.renderizarTabelaTalentos;
if (_renderTalentos) window.renderizarTabelaTalentos = function () {
  const r = _renderTalentos.apply(this, arguments);
  document.querySelectorAll('#view-colab_talentos table').forEach(aplicarMapaCalor);
  return r;
};
window.aplicarMapaCalor = aplicarMapaCalor;

// ---------- Alerta de risco operacional ----------
const POSTO_POR_FUNC = { sorting: 'sorting', pesca: 'sorting', apoio: 'sorting', bipador: 'bancada', etiquetador: 'bancada', inducao: 'bancada' };
function riscoColaborador(nome, posto) {
  const c = (bancoDadosReps || []).find(x => x.nome === nome); if (!c || !posto) return false;
  const nota = c['aval_' + posto], pls = numMatriz(c['pls_' + posto]);
  if (nota && nota !== '-') return numMatriz(nota) < 5;
  return pls <= 0;
}
window.riscoColaboradorPosto = riscoColaborador;
function nomeDoDrag(ev) { try { const d = JSON.parse(ev.dataTransfer.getData('text/plain')); return d.tipo === 'REP' ? d.nome : ''; } catch (e) { return ''; } }
function confirmarRisco(nome, posto) {
  if (!riscoColaborador(nome, posto)) return true;
  return confirm(`⚠️ Atenção: ${nome} pode estar abaixo do nível de desempenho esperado para esta posição (${posto}).\n\nDeseja mantê-lo?`);
}
function envolverDrop(nomeFn, postoDe) {
  const orig = window[nomeFn]; if (typeof orig !== 'function') return;
  window[nomeFn] = function (ev, ...args) {
    const nome = nomeDoDrag(ev);
    if (nome && !confirmarRisco(nome, postoDe(...args))) { ev.preventDefault(); ev.currentTarget?.classList.remove('drag-over'); return; }
    return orig.call(this, ev, ...args);
  };
}
envolverDrop('dropNaIlhaEsteira', (i, func) => POSTO_POR_FUNC[func] || 'sorting');
envolverDrop('dropNaBancadaEsteira', (i, sub) => POSTO_POR_FUNC[sub] || 'bancada');
envolverDrop('dropNaEsteira', () => 'bancada');
envolverDrop('dropNoVolumosoChao', () => 'volumoso');
envolverDrop('dropNaAuditoria', () => 'aduana');

// ---------- Destino iluminado durante o arraste ----------
document.addEventListener('dragstart', e => { if (e.target?.closest?.('[draggable="true"]')) document.body.classList.add('v23-arrastando'); });
['dragend', 'drop'].forEach(t => document.addEventListener(t, () => document.body.classList.remove('v23-arrastando')));

// ---------- Auto-Escalar = sugestão por HC + PLS ----------
function hcNecessario() { const el = $('calc-resultado-hc') || document.querySelector('[data-hc-total]'); const n = el ? numMatriz(el.dataset?.hcTotal || el.textContent) : 0; return n || null; }
function sugestaoPorHabilidade(menu) {
  const pool = (typeof obterPoolEquipaMenuAtual === 'function' ? obterPoolEquipaMenuAtual() : []).map(c => c.nome || c);
  const alocados = new Set(typeof obterColaboradoresAlocadosNaFerramentaAtual === 'function' ? obterColaboradoresAlocadosNaFerramentaAtual() : []);
  const livres = pool.filter(n => !alocados.has(n));
  const postos = menu === 'lab_vol_chao' ? ['volumoso'] : ['sorting', 'bancada', 'volumoso'];
  const usados = new Set();
  const porPosto = {};
  postos.forEach(p => {
    porPosto[p] = livres.filter(n => !usados.has(n)).map(n => { const c = bancoDadosReps.find(x => x.nome === n) || {}; return { nome: n, pls: numMatriz(c['pls_' + p]), nota: c['aval_' + p] }; })
      .sort((a, b) => b.pls - a.pls).slice(0, Math.ceil(livres.length / postos.length));
    porPosto[p].forEach(x => usados.add(x.nome));
  });
  return { livres: livres.length, alocados: alocados.size, porPosto };
}
window.sugestaoPorHabilidade = sugestaoPorHabilidade;
function abrirSugestoes() {
  const s = sugestaoPorHabilidade(submenuAtual);
  const hc = hcNecessario();
  const rot = { sorting: 'Sorting', bancada: 'Bancada / Indução', volumoso: 'Volumoso' };
  const corpo = Object.entries(s.porPosto).map(([p, l]) => `<h4>${rot[p]}</h4>` + (l.length ? `<ol>${l.map(x => `<li><b>${esc(x.nome)}</b> — PLS ${x.pls || '-'} ${window.distintivoNivel(x.nota)}</li>`).join('')}</ol>` : '<p class="sub-hint">Sem sugestões.</p>')).join('');
  modal('⚡ Sugestão de escala por habilidade', `
    <div class="v23-kpis"><div><b>${s.alocados}</b><span>alocados</span></div><div><b>${s.livres}</b><span>no banco</span></div><div><b>${hc ?? '—'}</b><span>HC previsto (Calculadora)</span></div>
    <div><b class="${hc && s.alocados + s.livres < hc ? 'txt-ruim' : 'txt-bom'}">${hc ? (s.alocados + s.livres - hc) : '—'}</b><span>saldo de pessoas</span></div></div>
    <p class="sub-hint">Apenas sugestão: ninguém é alocado automaticamente. Arraste os nomes indicados para os postos.</p>${corpo}`);
}
['autoEscalarEsteiraAtivaPorPLS', 'autoEscalarVolumosoChao'].forEach(fn => { if (window[fn]) window[fn] = abrirSugestoes; });
window.abrirSugestoesHabilidade = abrirSugestoes;

// ---------- Modal genérico ----------
function modal(titulo, html, extraBotoes = '') {
  let m = $('v23-modal');
  if (!m) { m = document.createElement('div'); m.id = 'v23-modal'; m.className = 'v23-modal-fundo'; m.onclick = e => { if (e.target === m) m.style.display = 'none'; }; document.body.appendChild(m); }
  m.innerHTML = `<div class="v23-modal"><div class="v23-modal-topo"><h3>${titulo}</h3><button class="v23-x" onclick="document.getElementById('v23-modal').style.display='none'">✕</button></div><div class="v23-modal-corpo">${html}</div>${extraBotoes ? `<div class="v23-modal-rodape">${extraBotoes}</div>` : ''}</div>`;
  m.style.display = 'flex';
}
window.v23Modal = modal;

// ---------- POPs ----------
const POPS_PADRAO = [
  { t: 'Pacote sem etiqueta', p: 'Separar na bancada PS, consultar ID no sistema, reimprimir etiqueta e devolver ao fluxo da rota.' },
  { t: 'Pacote avariado', p: 'Fotografar, registrar ocorrência, reembalar se possível; se não, segregar na gaiola de avaria e avisar o TL.' },
  { t: 'Rota sem vaga / caminhão atrasado', p: 'Manter carga no pulmão da ilha, informar Expedição e registrar horário no H/H.' },
  { t: 'Parada de esteira', p: 'Acionar botão de emergência, interromper indução, avisar manutenção e TL; redistribuir equipe em 5S.' },
  { t: 'Divergência de volume (falta/sobra)', p: 'Conferir bipagem da rota, recontar a gaiola e registrar divergência no quadro PS.' },
];
function pops() { return estadoColetivo.popsHub && estadoColetivo.popsHub.length ? estadoColetivo.popsHub : POPS_PADRAO; }
window.abrirPOPs = function (filtro = '') {
  const f = filtro.toLowerCase();
  const lista = pops().map((x, i) => ({ ...x, i })).filter(x => !f || (x.t + ' ' + x.p).toLowerCase().includes(f));
  const adm = usuarioLogado?.cargo === 'ADM';
  modal('📘 Procedimentos (POPs)', `<input type="search" class="form-control" placeholder="Buscar procedimento" value="${esc(filtro)}" oninput="abrirPOPs(this.value);setTimeout(()=>{const i=document.querySelector('#v23-modal input');i.focus();i.setSelectionRange(i.value.length,i.value.length)},0)">
    <div class="v23-pops">${lista.map(x => `<details><summary>${esc(x.t)}</summary><p>${esc(x.p)}</p>${adm ? `<button class="btn-doca-sm" onclick="excluirPOP(${x.i})">Excluir</button>` : ''}</details>`).join('') || '<p class="sub-hint">Nenhum procedimento encontrado.</p>'}</div>
    ${adm ? `<h4>Novo procedimento</h4><input id="v23-pop-t" class="form-control" placeholder="Título"><textarea id="v23-pop-p" class="form-control" rows="3" placeholder="Passo a passo"></textarea><button class="btn-primary" onclick="adicionarPOP()">Adicionar</button>` : ''}`);
};
window.adicionarPOP = function () { const t = $('v23-pop-t').value.trim(), p = $('v23-pop-p').value.trim(); if (!t || !p) return; estadoColetivo.popsHub = [...pops(), { t, p }]; salvarEstadoColetivoSQLite(); abrirPOPs(); };
window.excluirPOP = function (i) { const l = [...pops()]; l.splice(i, 1); estadoColetivo.popsHub = l; salvarEstadoColetivoSQLite(); abrirPOPs(); };

// ---------- Painel PS: indicadores ----------
function marcarTempos() {
  (estadoColetivo.psTarefas || []).forEach(t => {
    if (!t.criadoEm) t.criadoEm = typeof t.id === 'number' ? t.id : Date.now();
    if (/conclu|resolvid/i.test(t.status || '') && !t.concluidoEm) t.concluidoEm = Date.now();
  });
}
const _atStatus = window.atualizarStatusTarefaPS;
if (_atStatus) window.atualizarStatusTarefaPS = function (id, st) { const t = (estadoColetivo.psTarefas || []).find(x => x.id === id); if (t && /conclu|resolvid/i.test(st)) t.concluidoEm = Date.now(); return _atStatus.apply(this, arguments); };
const _concluir = window.concluirTarefaPSApagandoFoto;
if (_concluir) window.concluirTarefaPSApagandoFoto = function (id) { const t = (estadoColetivo.psTarefas || []).find(x => x.id === id); if (t) t.concluidoEm = Date.now(); return _concluir.apply(this, arguments); };
function indicadoresPS(login) {
  marcarTempos();
  const todas = (estadoColetivo.psTarefas || []).filter(t => !login || !t.responsavel || String(t.responsavel).toLowerCase() === login.toLowerCase());
  const feitas = todas.filter(t => /conclu|resolvid/i.test(t.status || ''));
  const tempos = feitas.filter(t => t.concluidoEm && t.criadoEm).map(t => (t.concluidoEm - t.criadoEm) / 60000);
  const media = tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null;
  const postos = new Set(feitas.map(t => t.posto || t.descricao?.match(/ilha\s*\w+|vaga\s*\d+|bancada\s*\w*/i)?.[0]).filter(Boolean));
  return { resolvidas: feitas.length, pendentes: todas.length - feitas.length, media, postos: postos.size || feitas.length, sla: tempos.length ? Math.round(100 * tempos.filter(m => m <= 30).length / tempos.length) : null, todas, feitas };
}
window.indicadoresPS = indicadoresPS;
function htmlKPIsPS(login) {
  const k = indicadoresPS(login);
  return `<div class="v23-kpis v23-kpis-ps">
    <div><b>${k.resolvidas}</b><span>Problemas resolvidos</span></div>
    <div><b>${k.postos}</b><span>Postos atendidos</span></div>
    <div><b class="${k.pendentes ? 'txt-atencao' : ''}">${k.pendentes}</b><span>Pendentes</span></div></div>
    <div class="v23-acoes-ps"><button class="btn-doca-sm" onclick="abrirPOPs()">📘 POPs</button>${window.ehUsuarioPS && window.ehUsuarioPS() ? '<button class="btn-primary" onclick="finalizarTurnoPS()">🔁 Passagem de turno (PS)</button>' : ''}</div>`;
}
const _renderPSInd = window.renderizarPainelIndividualPS;
if (_renderPSInd) window.renderizarPainelIndividualPS = function () {
  const r = _renderPSInd.apply(this, arguments);
  const v = $('view-lab_ps_individual'); if (v) { let box = $('v23-ps-kpis'); if (!box) { box = document.createElement('div'); box.id = 'v23-ps-kpis'; (v.querySelector('.rel-box') || v).prepend(box); } box.innerHTML = htmlKPIsPS(usuarioLogado?.usuario); }
  // estado vazio com ações rápidas
  v?.querySelectorAll('*').forEach(el => { if (el.children.length === 0 && /Nenhum posto escalado/.test(el.textContent)) el.innerHTML = `<span class="v23-vazio">Nenhum posto escalado <button class="btn-doca-sm" onclick="solicitarAlocacaoTL()">📨 Solicitar alocação ao TL</button> <button class="btn-doca-sm" onclick="abrirMapaCalorOperacao()">🔥 Ver mapa de calor da operação</button></span>`; });
  return r;
};
const _renderPSG = window.renderizarGestaoPS;
if (_renderPSG) window.renderizarGestaoPS = function () {
  const r = _renderPSG.apply(this, arguments);
  const v = $('view-lab_ps_gestao'); if (v) { let box = $('v23-psg-kpis'); if (!box) { box = document.createElement('div'); box.id = 'v23-psg-kpis'; (v.querySelector('.rel-box') || v).prepend(box); } box.innerHTML = htmlKPIsPS(''); }
  if (!$('ps-nova-tarefa-urgente') && $('ps-nova-tarefa-desc')) $('ps-nova-tarefa-desc').insertAdjacentHTML('afterend', '<label class="v23-urgente"><input type="checkbox" id="ps-nova-tarefa-urgente"> 🔴 Urgente (alerta sonoro)</label>');
  return r;
};
window.solicitarAlocacaoTL = function () {
  estadoColetivo.psPedidosTL = estadoColetivo.psPedidosTL || [];
  estadoColetivo.psPedidosTL.unshift({ id: Date.now(), hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), autor: `${usuarioLogado.nome} ${usuarioLogado.cargo || ''}`, tipo: 'Alocação de posto', descricao: 'Solicito alocação em posto de trabalho.', status: 'Mensagem enviada', urgente: false });
  salvarEstadoColetivoSQLite(); alert('Pedido enviado ao TL.');
};
window.abrirMapaCalorOperacao = function () {
  const grupos = {};
  Object.keys(estadoColetivo.repsEstado || {}).forEach(n => (typeof localizarColaborador === 'function' ? localizarColaborador(n) : []).forEach(a => { const k = NOMES_LABOR?.[a.menu] || a.menu; grupos[k] = (grupos[k] || 0) + 1; }));
  const max = Math.max(1, ...Object.values(grupos));
  modal('🔥 Mapa de calor da operação', Object.keys(grupos).length ? Object.entries(grupos).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div class="v23-calor"><span>${esc(k)}</span><i style="width:${Math.round(100 * n / max)}%"></i><b>${n}</b></div>`).join('') : '<p class="sub-hint">Ninguém alocado ainda.</p>');
};

// Urgente nas tarefas e pedidos ao TL
const _criarTarefa = window.criarTarefaPS;
if (_criarTarefa) window.criarTarefaPS = function () {
  const urg = $('ps-nova-tarefa-urgente')?.checked; const antes = (estadoColetivo.psTarefas || [])[0]?.id;
  const r = _criarTarefa.apply(this, arguments);
  const marcar = () => { const t = (estadoColetivo.psTarefas || [])[0]; if (t && t.id !== antes) { t.criadoEm = t.id; if (urg) { t.urgente = true; salvarEstadoColetivoSQLite(); } if ($('ps-nova-tarefa-urgente')) $('ps-nova-tarefa-urgente').checked = false; } };
  setTimeout(marcar, 400); return r;
};
const _criarPedidoTL = window.criarPedidoAoTL;
if (_criarPedidoTL) window.criarPedidoAoTL = function () {
  const urg = $('tl-pedido-urgente')?.checked; const r = _criarPedidoTL.apply(this, arguments);
  if (urg && estadoColetivo.psPedidosTL?.[0]) { estadoColetivo.psPedidosTL[0].urgente = true; salvarEstadoColetivoSQLite(); $('tl-pedido-urgente').checked = false; }
  return r;
};
function garantirCheckboxTL() { const d = $('tl-pedido-desc'); if (d && !$('tl-pedido-urgente')) d.insertAdjacentHTML('afterend', '<label class="v23-urgente"><input type="checkbox" id="tl-pedido-urgente"> 🔴 Urgente (alerta sonoro)</label>'); }

// ---------- Passagem de turno automática do PS ----------
window.finalizarTurnoPS = function () {
  if (!(window.ehUsuarioPS && window.ehUsuarioPS())) { alert('A passagem de turno é feita somente pelo Problem Solver (PS).'); return; }
  const k = indicadoresPS(usuarioLogado?.usuario);
  const hoje = new Date().toLocaleDateString('pt-BR');
  const texto = `Passagem de turno PS — ${usuarioLogado?.nome || ''} — ${hoje}\n\n✅ Concluídas: ${k.resolvidas}\n${k.feitas.map(t => `• ${t.descricao}`).join('\n') || '• —'}\n\n⏳ Pendentes: ${k.pendentes}\n${k.todas.filter(t => !k.feitas.includes(t)).map(t => `• ${t.descricao}${t.urgente ? ' (URGENTE)' : ''}`).join('\n') || '• —'}`;
  modal('🔁 Passagem de turno', `<textarea class="form-control" rows="14" id="v23-passagem">${esc(texto)}</textarea><p class="sub-hint">Ao confirmar, as tarefas concluídas são arquivadas e as pendentes ficam para o próximo PS.</p>`,
    `<button class="btn-doca-sm" onclick="navigator.clipboard.writeText(document.getElementById('v23-passagem').value).then(()=>alert('Copiado!'))">📋 Copiar</button><button class="btn-primary" onclick="confirmarPassagemPS()">Confirmar e liberar</button>`);
};
window.confirmarPassagemPS = function () {
  const k = indicadoresPS(usuarioLogado?.usuario);
  estadoColetivo.passagensPS = [{ id: Date.now(), autor: usuarioLogado?.nome, texto: $('v23-passagem').value }, ...(estadoColetivo.passagensPS || [])].slice(0, 30);
  const ids = new Set(k.feitas.map(t => t.id));
  estadoColetivo.psTarefas = (estadoColetivo.psTarefas || []).filter(t => !ids.has(t.id));
  salvarEstadoColetivoSQLite(); $('v23-modal').style.display = 'none'; renderizarTelaAtiva();
};

// ---------- Emergência ----------
window.dispararEmergencia = function () {
  const motivo = prompt('🚨 Relatar parada de linha / incidente.\nDescreva rapidamente (local e motivo):');
  if (!motivo || !motivo.trim()) return;
  estadoColetivo.emergencias = [{ id: Date.now(), autor: usuarioLogado?.nome || usuarioLogado?.usuario, texto: motivo.trim(), ts: Date.now() }, ...(estadoColetivo.emergencias || [])].slice(0, 20);
  salvarEstadoColetivoSQLite(); verificarAlertas(true);
};
window.encerrarEmergencia = function (id) { const e = (estadoColetivo.emergencias || []).find(x => x.id === id); if (e) { e.encerrada = Date.now(); e.encerradaPor = usuarioLogado?.nome; salvarEstadoColetivoSQLite(); } verificarAlertas(); };
window.cienteEmergencia = function (id) { const v = new Set(JSON.parse(localStorage.getItem('hub_emerg_vistas') || '[]')); v.add(id); localStorage.setItem('hub_emerg_vistas', JSON.stringify([...v])); verificarAlertas(); };

// ---------- Verificação periódica de alertas ----------
const vistos = { chat: null, ps: null, urgentes: new Set(JSON.parse(sessionStorage.getItem('hub_urg') || '[]')) };
function verificarAlertas(local) {
  if (!usuarioLogado || !estadoColetivo) return;
  const vistas = new Set(JSON.parse(localStorage.getItem('hub_emerg_vistas') || '[]'));
  const ativas = (estadoColetivo.emergencias || []).filter(e => !e.encerrada && Date.now() - e.ts < 4 * 3600000);
  const naoVistas = ativas.filter(e => !vistas.has(e.id));
  let barra = $('v23-emergencia');
  if (!barra) { barra = document.createElement('div'); barra.id = 'v23-emergencia'; document.body.appendChild(barra); }
  if (ativas.length) {
    const e = ativas[0];
    barra.className = 'v23-emergencia ' + (naoVistas.length ? 'piscando' : '');
    barra.innerHTML = `🚨 <b>PARADA / INCIDENTE</b> — ${esc(e.texto)} <small>(${esc(e.autor || '')} · ${new Date(e.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})</small>
      ${naoVistas.length ? `<button onclick="cienteEmergencia(${e.id})">Ciente</button>` : ''}${['ADM', 'TL'].includes(usuarioLogado.cargo) ? `<button onclick="encerrarEmergencia(${e.id})">Encerrar</button>` : ''}`;
    barra.style.display = 'flex';
    if (naoVistas.length && !local) SONS.emergencia();
  } else barra.style.display = 'none';
  // PS: novas tarefas / urgentes
  const tarefas = estadoColetivo.psTarefas || [], pedidos = estadoColetivo.psPedidosTL || [];
  const ids = tarefas.map(t => t.id).join(',');
  if (vistos.ps !== null && ids !== vistos.ps && tarefas.length && !String(vistos.ps).includes(String(tarefas[0].id))) SONS.ps();
  vistos.ps = ids;
  const urg = [...tarefas, ...pedidos].filter(t => t.urgente && !/conclu|resolvid|atendid|recusad/i.test(t.status || ''));
  const novosUrg = urg.filter(t => !vistos.urgentes.has(t.id));
  let bt = $('v23-btn-urgente');
  if (bt) { bt.style.display = urg.length ? 'inline-flex' : 'none'; bt.textContent = `🔴 ${urg.length} urgente${urg.length > 1 ? 's' : ''}`; bt.classList.toggle('piscando', novosUrg.length > 0); }
  if (novosUrg.length && !local) SONS.urgente();
  // banco de reps
  atualizarAbaBanco();
}
window.verUrgentes = function () {
  const urg = [...(estadoColetivo.psTarefas || []).map(t => ({ ...t, origem: 'Tarefa PS' })), ...(estadoColetivo.psPedidosTL || []).map(t => ({ ...t, origem: 'Pedido ao TL' }))].filter(t => t.urgente && !/conclu|resolvid|atendid|recusad/i.test(t.status || ''));
  urg.forEach(t => vistos.urgentes.add(t.id)); sessionStorage.setItem('hub_urg', JSON.stringify([...vistos.urgentes]));
  modal('🔴 Chamados urgentes', urg.map(t => `<div class="v23-urg-item"><b>${esc(t.origem)}</b> · ${esc(t.hora || '')}<br>${esc(t.descricao)}<br><small>${esc(t.responsavel || t.autor || '')} — ${esc(t.status || '')}</small></div>`).join('') || '<p class="sub-hint">Sem chamados urgentes.</p>');
  verificarAlertas(true);
};
// som no chat
const _carregarChat = window.carregarMensagensChat;
if (_carregarChat) window.carregarMensagensChat = function () {
  const r = _carregarChat.apply(this, arguments);
  setTimeout(() => { const box = $('chat-mensagens') || document.querySelector('.chat-messages, #chat-body'); if (!box) return; const n = box.children.length; if (vistos.chat !== null && n > vistos.chat) { const ultimo = box.lastElementChild?.textContent || ''; if (!ultimo.includes(usuarioLogado?.nome || '§')) SONS.chat(); } vistos.chat = n; }, 900);
  return r;
};
setInterval(() => verificarAlertas(false), 5000);

// ---------- Banco de Reps flutuante ----------
function atualizarAbaBanco() {
  const sb = $('sidebar-right'); const aba = $('v23-aba-banco'); if (!sb || !aba) return;
  const visivel = sb.style.display !== 'none' && (typeof MENUS_COM_POOL === 'undefined' || MENUS_COM_POOL.includes(submenuAtual));
  let n = 0; try { const pool = obterPoolEquipaMenuAtual(); const al = new Set(obterColaboradoresAlocadosNaFerramentaAtual()); n = pool.filter(c => !al.has(c.nome || c)).length; } catch (e) {}
  aba.style.display = visivel ? 'flex' : 'none';
  aba.innerHTML = `👥 Banco (${n})`; aba.classList.toggle('com-gente', n > 0);
  const tb = $('v23-btn-banco'); if (tb) { tb.style.display = visivel ? 'inline-flex' : 'none'; tb.textContent = `👥 Banco de Reps (${n})`; tb.classList.toggle('acende', n > 0); }
  if (n === 0 && !sb.dataset.manual) sb.classList.add('recolhida');
}
window.alternarBancoFlutuante = function () { const sb = $('sidebar-right'); sb.dataset.manual = '1'; sb.classList.toggle('recolhida'); };

// ---------- Briefing (PNG + TV) ----------
function coletarBriefing() {
  const grupos = new Map();
  const nomes = new Set([...Object.keys(estadoColetivo.repsEstado || {}), ...(bancoDadosReps || []).map(c => c.nome)]);
  nomes.forEach(n => (localizarColaborador(n) || []).forEach(a => {
    if (!['lab_esteira', 'lab_vol_esteira', 'lab_vol_chao', 'lab_recebimento', 'lab_layout', 'lab_auditoria'].includes(a.menu)) return;
    const labor = NOMES_LABOR?.[a.menu] || a.menu;
    const setor = a.posto.replace(/^(Sorting|Pesca|Apoio): /, (m, p) => p + ' · ').replace(/ · (REP2|REP)$/, '');
    const k = labor + '|' + setor.split(' · ')[0];
    if (!grupos.has(k)) grupos.set(k, { labor, setor: setor.split(' · ')[0], pessoas: [] });
    grupos.get(k).pessoas.push({ nome: n, funcao: setor.includes(' · ') ? setor.split(' · ').slice(1).join(' · ') : setor, cargo: cargoDe(n) });
  }));
  return [...grupos.values()].sort((a, b) => a.labor.localeCompare(b.labor) || a.setor.localeCompare(b.setor, 'pt', { numeric: true }));
}
window.coletarBriefing = coletarBriefing;
function desenharBriefing() {
  const grupos = coletarBriefing();
  const W = 1920, col = 4, gap = 24, cw = (W - gap * (col + 1)) / col, cardH = 64;
  const alturas = grupos.map(g => 60 + Math.ceil(g.pessoas.length / 2) * (cardH + 10) + 10);
  const linhas = []; for (let i = 0; i < grupos.length; i += col) linhas.push(Math.max(...alturas.slice(i, i + col)));
  const H = Math.max(1080, 150 + linhas.reduce((a, b) => a + b + gap, 0) + 80);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  c.fillStyle = '#090A0F'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#FFE600'; c.font = '900 46px Arial'; c.fillText('BRIEFING DA OPERAÇÃO', gap, 66);
  c.fillStyle = '#e5e7eb'; c.font = '600 24px Arial'; c.fillText(new Date().toLocaleString('pt-BR'), gap, 104);
  const leg = [['REP', CORES_CARGO.REP], ['REP II', CORES_CARGO['REP II']], ['OPS II', CORES_CARGO['OPS II']], ['OPS III', CORES_CARGO['OPS III']], ['EXTRA', CORES_CARGO.EXTRA]];
  let lx = W - gap; c.font = '700 20px Arial'; [...leg].reverse().forEach(([t, cor]) => { const w = c.measureText(t).width + 44; lx -= w; c.fillStyle = cor; c.beginPath(); c.roundRect(lx, 70, w - 10, 34, 8); c.fill(); c.fillStyle = '#fff'; c.fillText(t, lx + 12, 94); });
  let y = 140;
  grupos.forEach((g, i) => {
    const ci = i % col; if (i && ci === 0) y += linhas[i / col - 1] + gap;
    const x = gap + ci * (cw + gap), h = alturas[i];
    c.fillStyle = '#12151E'; c.beginPath(); c.roundRect(x, y, cw, h, 10); c.fill();
    c.fillStyle = '#FFE600'; c.font = '800 24px Arial'; c.fillText(g.setor.slice(0, 34), x + 16, y + 36);
    c.fillStyle = '#94a3b8'; c.font = '600 16px Arial'; c.fillText(g.labor, x + 16, y + 54);
    g.pessoas.forEach((p, j) => {
      const px = x + 12 + (j % 2) * ((cw - 34) / 2 + 10), py = y + 66 + Math.floor(j / 2) * (cardH + 10), pw = (cw - 34) / 2;
      c.fillStyle = corCargo(p.cargo); c.beginPath(); c.roundRect(px, py, pw, cardH, 8); c.fill();
      c.fillStyle = '#fff'; c.font = '800 24px Arial'; c.fillText(p.nome.split(' ')[0].toUpperCase().slice(0, 14), px + 12, py + 30);
      c.font = '600 15px Arial'; c.fillText((p.funcao || '').slice(0, 26), px + 12, py + 52);
    });
  });
  if (!grupos.length) { c.fillStyle = '#94a3b8'; c.font = '700 36px Arial'; c.fillText('Nenhum colaborador alocado nas Labors.', gap, 220); }
  return cv;
}
window.gerarImagemBriefing = function () {
  const cv = desenharBriefing();
  cv.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `briefing_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }, 'image/png');
};
window.abrirBriefingTV = function () {
  let tv = $('v23-tv'); if (!tv) { tv = document.createElement('div'); tv.id = 'v23-tv'; tv.onclick = () => { tv.style.display = 'none'; document.fullscreenElement && document.exitFullscreen(); }; document.body.appendChild(tv); }
  tv.innerHTML = ''; const cv = desenharBriefing(); tv.appendChild(cv); tv.style.display = 'flex';
  tv.requestFullscreen?.().catch(() => {});
};

// ---------- Topo, dock, pílulas, FAB ----------
const PILULAS = [['lab_esteira', 'Esteira'], ['lab_vol_esteira', 'Volumoso Esteira'], ['lab_vol_chao', 'Volumoso Chão'], ['lab_recebimento', 'Recebimento'], ['exp_mapa_svc', 'Pista SVC'], ['exp_mapa_xd', 'Pista XD'], ['exp_xpt', 'XPT']];
const ICONES_GRUPO = { 'g-adm': '⚙️' };
function montarInterface() {
  if ($('v23-pilulas')) return;
  document.body.classList.add('v23');
  const header = document.querySelector('.global-header');
  if (header) {
    const centro = document.createElement('div'); centro.className = 'v23-centro';
    centro.innerHTML = `<button class="v23-cmd" data-labor onclick="gerarImagemBriefing()">🖼️<span> Gerar Imagem do Briefing</span></button><button class="v23-cmd" data-labor onclick="abrirBriefingTV()">📺<span> TV</span></button><button class="v23-cmd" data-pops onclick="abrirPOPs()">📘<span> POPs</span></button>
      <button class="v23-cmd v23-urgente-btn" id="v23-btn-urgente" style="display:none" onclick="verUrgentes()"></button>`;
    header.querySelector('.header-left').after(centro);
    const acoes = header.querySelector('.toolbar-actions');
    acoes.insertAdjacentHTML('afterbegin', `<button class="v23-cmd" id="v23-btn-banco" style="display:none" onclick="alternarBancoFlutuante()"></button><button class="v23-cmd" id="v23-btn-som" title="Som dos alertas" onclick="alternarSomHub()">${somAtivo ? '🔊' : '🔇'}</button>`);
    const gg = $('btn-gente-gestao'); if (gg) { gg.textContent = '👥 G&G'; gg.title = 'Gente & Gestão / Ociosos'; }
    const sair = acoes.querySelector('.btn-logout');
    const perfil = document.createElement('div'); perfil.className = 'v23-perfil';
    perfil.innerHTML = `<button class="v23-avatar" id="v23-avatar" onclick="this.parentNode.classList.toggle('aberto')">--</button><div class="v23-perfil-menu"><div id="v23-perfil-nome"></div></div>`;
    acoes.appendChild(perfil);
    if (sair) perfil.querySelector('.v23-perfil-menu').appendChild(sair);
    document.addEventListener('click', e => { if (!perfil.contains(e.target)) perfil.classList.remove('aberto'); });
    const pil = document.createElement('div'); pil.id = 'v23-pilulas'; pil.className = 'v23-pilulas';
    pil.innerHTML = PILULAS.map(([m, t]) => `<button data-menu="${m}" onclick="mudarSubmenu('${m}')">${t}</button>`).join('');
    header.after(pil);
  }
  // dock: ícones nos títulos das gavetas
  document.querySelectorAll('.gaveta-titulo span:first-child').forEach(s => { const ic = (s.textContent.trim().match(/^\p{Extended_Pictographic}\uFE0F?/u) || ['•'])[0]; s.dataset.icone = ic; });
  const drawer = $('pista-drawer'); if (drawer && window.innerWidth <= 640) drawer.classList.add('recolhida');
  if (drawer) drawer.addEventListener('click', e => { if (e.target.closest('.btn-drawer-item')) { drawer.classList.add('v23-fechar'); setTimeout(() => drawer.classList.remove('v23-fechar'), 400); } });
  // FAB emergência
  const fab = document.createElement('button'); fab.className = 'v23-fab'; fab.id = 'v23-fab'; fab.title = 'Relatar Parada de Linha / Incidente'; fab.innerHTML = '🚨<span>Relatar Parada / Incidente</span>'; fab.onclick = dispararEmergencia; document.body.appendChild(fab);
  // aba banco
  const aba = document.createElement('button'); aba.id = 'v23-aba-banco'; aba.className = 'v23-aba-banco'; aba.style.display = 'none'; aba.onclick = alternarBancoFlutuante; document.body.appendChild(aba);
}
function atualizarInterface() {
  montarInterface();
  const ehLabor = (typeof MENUS_COM_POOL !== 'undefined' ? MENUS_COM_POOL : []).includes(submenuAtual) || /^lab_(esteira|vol|recebimento|layout|auditoria)/.test(submenuAtual);
  document.querySelectorAll('.v23-cmd[data-labor]').forEach(b => b.style.display = ehLabor ? '' : 'none');
  const pil = $('v23-pilulas'); if (pil) { pil.style.display = PILULAS.some(([m]) => m === submenuAtual) ? 'flex' : 'none'; pil.querySelectorAll('button').forEach(b => { b.classList.toggle('ativa', b.dataset.menu === submenuAtual); b.style.display = typeof temPermissaoMenu === 'function' && !temPermissaoMenu(b.dataset.menu) ? 'none' : ''; }); }
  if (usuarioLogado) { const ini = String(usuarioLogado.nome || usuarioLogado.usuario || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase(); $('v23-avatar') && ($('v23-avatar').textContent = ini); $('v23-perfil-nome') && ($('v23-perfil-nome').innerHTML = `<b>${esc(usuarioLogado.nome || usuarioLogado.usuario)}</b><small>${esc(usuarioLogado.cargo || '')}</small>`); }
  const fab = $('v23-fab'); if (fab) fab.style.display = usuarioLogado ? 'flex' : 'none';
  garantirCheckboxTL();
  // ilhas sem carga ficam apagadas
  document.querySelectorAll('[data-pacotes]').forEach(el => el.classList.toggle('v23-sem-carga', Number(el.dataset.pacotes) === 0));
  document.querySelectorAll('#view-colab_talentos table, .v23-heat').forEach(aplicarMapaCalor);
  atualizarAbaBanco();
}
const _render = window.renderizarTelaAtiva;
if (_render) window.renderizarTelaAtiva = function () { const r = _render.apply(this, arguments); try { atualizarInterface(); } catch (e) { console.error(e); } return r; };
const _mudar = window.mudarSubmenu;
if (_mudar) window.mudarSubmenu = function () { const r = _mudar.apply(this, arguments); try { atualizarInterface(); } catch (e) { console.error(e); } return r; };
const _entrar = window.entrarNoAppShell;
if (_entrar) window.entrarNoAppShell = function () { const r = _entrar.apply(this, arguments); try { atualizarInterface(); verificarAlertas(true); } catch (e) {} return r; };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarInterface); else montarInterface();
})();
