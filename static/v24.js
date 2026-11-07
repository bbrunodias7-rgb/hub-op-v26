// Hub Operacional v24 — Recebimento tabular + relatório, tempo previsto em vaga,
// PS exclusivo, POPs editáveis (só Labors e PS) e botões flutuantes recolhíveis.
(function () {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => (typeof escapeHTML === 'function' ? escapeHTML(String(s ?? '')) : String(s ?? ''));
const arg = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const est = () => (typeof estadoColetivo !== 'undefined' ? estadoColetivo : {});
const user = () => (typeof usuarioLogado !== 'undefined' ? usuarioLogado : null);
const salvar = () => (typeof salvarEstadoColetivoSQLite === 'function' ? salvarEstadoColetivoSQLite() : Promise.resolve());

// ---------- Perfis ----------
function normCargo(c) { return String(c || '').toUpperCase().replace(/\s+/g, '').trim(); }
function ehPS(u = user()) { const c = normCargo(u?.cargo); return c === 'OPSII' || c === 'OPSII(PS)' || c === 'PS'; }
function ehADM(u = user()) { return normCargo(u?.cargo) === 'ADM'; }
function podeEditarPOPs(u = user()) { return ehADM(u) || normCargo(u?.cargo) === 'TL' || ehPS(u); }
function podeGerirRecebimento(u = user()) { return ehADM(u) || normCargo(u?.cargo) === 'TL'; }
window.ehUsuarioPS = () => ehPS();

const _perm = window.temPermissaoMenu;
if (typeof _perm === 'function') window.temPermissaoMenu = function (id) {
  if (id === 'lab_ps_individual') return !!user() && (ehPS() || ehADM());
  return _perm.apply(this, arguments);
};

// ---------- Tempo previsto em vaga ----------
// UNT = unidades/hora do colaborador no subsetor; PLS = fator de qualidade (% ou fração).
const SUBSETORES = { Volumoso: 'volumoso', Bancada: 'bancada', Sorting: 'sorting', Aduana: 'aduana' };
function fatorPLS(v) { const n = Number(String(v ?? '').replace(',', '.')); if (!(n > 0)) return 1; return n <= 1 ? n : n <= 100 ? n / 100 : 1; }
function taxaColab(c, sub) { const u = Number(String(c?.['unt_' + sub] ?? '').replace(',', '.')); return u > 0 ? u * fatorPLS(c['pls_' + sub]) : 0; }
function tempoPrevistoMin(volume, membros, subsetor, banco) {
  const sub = SUBSETORES[subsetor] || subsetor || 'volumoso';
  const vol = Number(volume) || 0; if (vol <= 0) return null;
  const lista = (banco || []);
  let taxa = (membros || []).filter(Boolean).reduce((s, n) => s + taxaColab(lista.find(c => c.nome === n), sub), 0);
  if (!(taxa > 0)) {
    const vals = lista.map(c => taxaColab(c, sub)).filter(v => v > 0);
    if (!vals.length) return null;
    taxa = (vals.reduce((a, b) => a + b, 0) / vals.length) * Math.max(1, (membros || []).filter(Boolean).length);
  }
  return Math.ceil(vol / taxa * 60);
}
window.tempoPrevistoMin = tempoPrevistoMin;
const fmtMin = m => m == null ? '—' : (m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`);
const banco = () => (typeof bancoDadosReps !== 'undefined' ? bancoDadosReps : []);

// Pista: adiciona previsão em cada vaga e alerta quando o tempo real passa do previsto.
const _mapa = window.renderizarMapaVagasPista;
if (typeof _mapa === 'function') window.renderizarMapaVagasPista = function (setor) {
  const r = _mapa.apply(this, arguments);
  document.querySelectorAll('#grid-vagas-pista .vaga-timer-badge').forEach(el => {
    const chave = el.id.replace('timer-', ''); const v = est().vagasPista?.[chave]; if (!v) return;
    const prev = tempoPrevistoMin(v.spr, [v.rep], 'Aduana', banco());
    el.dataset.previsto = prev || '';
    const box = el.closest('.doca'); if (!box || box.querySelector('.v24-prev')) return;
    box.querySelector('.doca-rota-box')?.insertAdjacentHTML('afterend', `<div class="v24-prev">⏱️ Previsto: <b>${fmtMin(prev)}</b></div>`);
  });
  return r;
};
setInterval(() => document.querySelectorAll('.vaga-timer-badge[data-previsto]').forEach(el => {
  const ini = Number(el.dataset.inicio), prev = Number(el.dataset.previsto);
  el.classList.toggle('v24-estourou', !!(ini && prev && (Date.now() - ini) / 60000 > prev));
}), 5000);

// ---------- Recebimento (Entrada / Descarga) ----------
function statusReceb(v) {
  if (v.fim) return 'FINALIZADO';
  if (v.doca) return `DOCA ${String(v.doca).padStart(2, '0')}`;
  if (v.chegada) return 'AGUAR: DOCA';
  return 'PENDENTE';
}
window.statusRecebimento = statusReceb;
function classeStatus(s) { return s === 'FINALIZADO' ? 'ok' : s.startsWith('DOCA') ? 'doca' : s === 'AGUAR: DOCA' ? 'aguar' : 'pend'; }
function veiculosReceb() { const e = est(); if (!Array.isArray(e.recebVeiculos)) e.recebVeiculos = []; return e.recebVeiculos; }
function membrosEquipe(i) { const eq = (est().recebEquipes || [])[Number(i)]; return eq ? [eq.rep2, ...(eq.reps || [])].filter(Boolean) : []; }
let abaReceb = 'labor';
const CAMPOS = [['id', 'ID'], ['servico', 'Serviço'], ['mot1', 'Motorista 1'], ['mot2', 'Motorista 2'], ['cavalo', 'Cavalo'], ['carreta', 'Carreta'], ['origem', 'Origem'], ['destino', 'Destino'], ['processamento', 'Processamento'], ['etd', 'Destino ETD'], ['volume', 'Volume (pcts)'], ['doca', 'Doca'], ['equipe', 'Equipe']];

function renderRecebimento() {
  if (abaReceb === 'labor' && typeof window.v25RenderReceb === 'function') { window.v25RenderReceb(); return; }
  const host = $('v24-receb'); if (!host) return;
  const vs = veiculosReceb(), g = podeGerirRecebimento();
  const abas = `<div class="v24-abas" role="tablist"><button class="btn-doca-sm ${abaReceb === 'labor' ? 'ativo' : ''}" onclick="v24AbaReceb('labor')">📥 Labor Descarga</button><button class="btn-doca-sm ${abaReceb === 'rel' ? 'ativo' : ''}" onclick="v24AbaReceb('rel')">📋 Relatório</button>${g ? '<button class="btn-primary" onclick="v24EditarReceb(-1)">＋ Veículo de entrada</button>' : ''}</div>`;
  const vazio = `<tr><td colspan="20" class="sub-hint">Nenhum veículo de entrada cadastrado.</td></tr>`;
  let corpo;
  if (abaReceb === 'labor') {
    corpo = `<div class="v24-tabela-wrap"><table class="v24-tabela"><thead><tr><th>ID</th><th>Serviço</th><th>Cavalo / Carreta</th><th>Origem</th><th>Volume</th><th>Subsetor</th><th>Equipe</th><th>Status</th><th>Tempo em vaga</th><th>Tempo previsto</th><th>Ações</th></tr></thead><tbody>${vs.map((v, i) => {
      const st = statusReceb(v), prev = tempoPrevistoMin(v.volume, membrosEquipe(v.equipe), v.subsetor, banco());
      const ini = v.inicioDoca, real = ini ? Math.round(((v.fim || Date.now()) - ini) / 60000) : null;
      const pct = prev && real != null ? Math.min(100, Math.round(real / prev * 100)) : 0;
      return `<tr><td><b>${esc(v.id)}</b></td><td>${esc(v.servico)}</td><td>${esc(v.cavalo)} / ${esc(v.carreta)}</td><td>${esc(v.origem)}</td><td>${esc(v.volume || 0)}</td><td>${esc(v.subsetor || 'Volumoso')}</td><td>${v.equipe !== '' && v.equipe != null ? 'Quadro ' + (Number(v.equipe) + 1) + ` (${membrosEquipe(v.equipe).length})` : '—'}</td>
        <td><span class="v24-tag ${classeStatus(st)}">${esc(st)}</span></td>
        <td><div class="v24-barra ${prev && real > prev ? 'estourou' : ''}"><i style="width:${pct}%"></i><span>${fmtMin(real)}</span></div></td><td>${fmtMin(prev)}</td>
        <td class="v24-acoes">${g ? `${!v.chegada ? `<button class="btn-doca-sm" onclick="v24AcaoReceb(${i},'chegada')">Chegou</button>` : ''}${v.chegada && !v.inicioDoca && v.doca ? `<button class="btn-doca-sm" onclick="v24AcaoReceb(${i},'iniciar')">Iniciar descarga</button>` : ''}${v.inicioDoca && !v.fim ? `<button class="btn-doca-sm" onclick="v24AcaoReceb(${i},'fim')">Finalizar</button>` : ''}<button class="btn-doca-sm" onclick="v24EditarReceb(${i})">✏️</button>` : ''}</td></tr>`;
    }).join('') || vazio}</tbody></table></div>`;
  } else {
    corpo = `<div class="v24-tabela-wrap"><table class="v24-tabela"><thead><tr><th>ID</th><th>Serviço</th><th>Motorista 1</th><th>Motorista 2</th><th>Cavalo</th><th>Carreta</th><th>Origem</th><th>Destino</th><th>Status</th><th>Processamento</th><th>Destino ETD</th></tr></thead><tbody>${vs.map(v => {
      const st = statusReceb(v);
      return `<tr><td><b>${esc(v.id)}</b></td><td>${esc(v.servico)}</td><td>${esc(v.mot1)}</td><td>${esc(v.mot2)}</td><td>${esc(v.cavalo)}</td><td>${esc(v.carreta)}</td><td>${esc(v.origem)}</td><td>${esc(v.destino)}</td><td><span class="v24-tag ${classeStatus(st)}">${esc(st)}</span></td><td>${esc(v.processamento)}</td><td>${esc(v.etd)}</td></tr>`;
    }).join('') || vazio}</tbody></table></div>
    <div class="reports-toolbar"><button class="btn-doca-sm" onclick="v24CopiarRelReceb()">📋 Copiar para WhatsApp</button><button class="btn-doca-sm" onclick="v24CsvRelReceb()">⬇ Exportar CSV</button></div>`;
  }
  host.innerHTML = abas + corpo;
  const eqT = $('v24-receb-eq-titulo'), eqC = $('container-quadros-receb');
  if (eqT) eqT.style.display = abaReceb === 'labor' ? '' : 'none';
  if (eqC) eqC.style.display = abaReceb === 'labor' ? '' : 'none';
}
window.v24AbaReceb = a => { abaReceb = a; renderRecebimento(); };
window.v24AcaoReceb = function (i, acao) {
  if (!podeGerirRecebimento()) return; const v = veiculosReceb()[i]; if (!v) return;
  if (acao === 'chegada') v.chegada = Date.now();
  if (acao === 'iniciar') v.inicioDoca = Date.now();
  if (acao === 'fim') { if (!v.inicioDoca) v.inicioDoca = Date.now(); v.fim = Date.now(); }
  salvar(); renderRecebimento();
};
window.v24EditarReceb = function (i) {
  if (!podeGerirRecebimento()) return;
  const v = i >= 0 ? veiculosReceb()[i] : { processamento: 'AM', subsetor: 'Volumoso', equipe: '' };
  const campo = ([k, l]) => {
    if (k === 'processamento') return `<label>${l}<select class="form-control" data-k="${k}">${['AM', 'PM'].map(o => `<option ${v[k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
    if (k === 'equipe') return `<label>${l}<select class="form-control" data-k="${k}"><option value="">—</option>${(est().recebEquipes || []).map((e, j) => `<option value="${j}" ${String(v[k]) === String(j) ? 'selected' : ''}>Quadro ${j + 1}</option>`).join('')}</select></label>`;
    return `<label>${l}<input class="form-control" data-k="${k}" ${k === 'volume' ? 'type="number" min="0"' : ''} value="${esc(v[k] ?? '')}"></label>`;
  };
  abrirModal(i >= 0 ? `Editar veículo ${esc(v.id)}` : 'Novo veículo de entrada', `<div class="v24-form">${CAMPOS.map(campo).join('')}</div>`,
    `${i >= 0 ? `<button class="btn-doca-sm" onclick="v24ExcluirReceb(${i})">🗑 Excluir</button><button class="btn-doca-sm" onclick="v24ReabrirReceb(${i})">↺ Reabrir</button>` : ''}<button class="btn-primary" onclick="v24SalvarReceb(${i})">Salvar</button>`);
};
window.v24SalvarReceb = function (i) {
  if (!podeGerirRecebimento()) return;
  const dados = {}; document.querySelectorAll('#v24-modal [data-k]').forEach(el => { dados[el.dataset.k] = el.value.trim(); });
  if (!dados.id) { alert('Informe o ID do veículo.'); return; }
  dados.volume = Number(dados.volume) || 0; dados.doca = dados.doca.replace(/\D/g, '');
  const lista = veiculosReceb();
  if (lista.some((x, j) => j !== i && String(x.id).toUpperCase() === dados.id.toUpperCase())) { alert('Já existe um veículo com esse ID.'); return; }
  if (i >= 0) Object.assign(lista[i], dados); else lista.push({ ...dados, criadoEm: Date.now() });
  salvar(); fecharModal(); renderRecebimento();
};
window.v24ExcluirReceb = function (i) { if (!podeGerirRecebimento() || !confirm('Excluir este veículo?')) return; veiculosReceb().splice(i, 1); salvar(); fecharModal(); renderRecebimento(); };
window.v24ReabrirReceb = function (i) { const v = veiculosReceb()[i]; if (!v) return; delete v.fim; salvar(); fecharModal(); renderRecebimento(); };
function textoRelReceb() {
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return `Report Recebimento - ${hoje}\n\n` + veiculosReceb().map(v => `• ${v.id} | ${v.servico || '-'} | ${v.cavalo || '-'}/${v.carreta || '-'} | ${v.origem || '-'} → ${v.destino || '-'} | ${statusReceb(v)} | ${v.processamento || '-'} | ETD ${v.etd || '-'}`).join('\n');
}
window.textoRelatorioRecebimento = textoRelReceb;
window.v24CopiarRelReceb = () => navigator.clipboard.writeText(textoRelReceb()).then(() => alert('Relatório copiado!'));
window.v24CsvRelReceb = function () {
  const cols = ['ID', 'Serviço', 'Motorista 1', 'Motorista 2', 'Cavalo', 'Carreta', 'Origem', 'Destino', 'Status', 'Processamento', 'Destino ETD'];
  const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const linhas = veiculosReceb().map(v => [v.id, v.servico, v.mot1, v.mot2, v.cavalo, v.carreta, v.origem, v.destino, statusReceb(v), v.processamento, v.etd].map(q).join(';'));
  const blob = new Blob(['\ufeff' + [cols.map(q).join(';'), ...linhas].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `relatorio_recebimento_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
};
const _quadros = window.renderizarQuadrosXPT;
if (typeof _quadros === 'function') window.renderizarQuadrosXPT = function () { const r = _quadros.apply(this, arguments); if (typeof submenuAtual !== 'undefined' && submenuAtual === 'lab_recebimento') renderRecebimento(); return r; };
setInterval(() => { if (typeof submenuAtual !== 'undefined' && submenuAtual === 'lab_recebimento' && abaReceb === 'labor' && !document.querySelector('#v24-modal[open], #v24-modal.aberto')) renderRecebimento(); }, 30000);

// ---------- Modal simples ----------
function abrirModal(titulo, html, rodape = '') {
  let m = $('v24-modal'); if (!m) { m = document.createElement('div'); m.id = 'v24-modal'; m.className = 'v24-modal'; document.body.appendChild(m); }
  m.innerHTML = `<div class="v24-modal-box"><div class="reports-heading"><h3>${titulo}</h3><button class="btn-doca-sm" onclick="v24FecharModal()" aria-label="Fechar">✕</button></div><div class="v24-modal-corpo">${html}</div><div class="v24-modal-rodape">${rodape}</div></div>`;
  m.classList.add('aberto');
}
function fecharModal() { $('v24-modal')?.classList.remove('aberto'); }
window.v24FecharModal = fecharModal;

// ---------- POPs editáveis (somente Labors e Painel PS) ----------
const POPS_BASE = [
  { t: 'Pacote sem etiqueta', p: 'Separar na bancada PS, consultar ID no sistema, reimprimir etiqueta e devolver ao fluxo da rota.' },
  { t: 'Pacote avariado', p: 'Fotografar, registrar ocorrência, reembalar se possível; se não, segregar na gaiola de avaria e avisar o TL.' },
];
function listaPOPs() { const e = est(); if (!Array.isArray(e.popsHub) || !e.popsHub.length) e.popsHub = POPS_BASE.map(x => ({ ...x })); return e.popsHub; }
function telaPermitePOPs() { const m = typeof submenuAtual !== 'undefined' ? submenuAtual : ''; return /^lab_/.test(m) || m === 'lab_ps_individual' || m === 'lab_ps_gestao'; }
window.abrirPOPs = function (filtro = '') {
  if (!telaPermitePOPs()) { alert('Os POPs ficam disponíveis no Painel do Problem Solver e nas Labors.'); return; }
  const f = String(filtro).toLowerCase(), ed = podeEditarPOPs();
  const lista = listaPOPs().map((x, i) => ({ ...x, i })).filter(x => !f || (x.t + ' ' + x.p).toLowerCase().includes(f));
  abrirModal('📘 Procedimentos (POPs)', `<input type="search" id="v24-pop-busca" class="form-control" placeholder="Buscar procedimento" value="${esc(filtro)}" oninput="v24FiltrarPOPs(this.value)">
    <div class="v23-pops">${lista.map(x => `<details><summary>${esc(x.t)}</summary><p style="white-space:pre-wrap">${esc(x.p)}</p>${ed ? `<div class="v24-acoes"><button class="btn-doca-sm" onclick="v24EditarPOP(${x.i})">✏️ Editar</button><button class="btn-doca-sm" onclick="v24ExcluirPOP(${x.i})">🗑 Excluir</button></div>` : ''}</details>`).join('') || '<p class="sub-hint">Nenhum procedimento encontrado.</p>'}</div>
    ${ed ? `<h4 id="v24-pop-form-tit">Novo procedimento</h4><input type="hidden" id="v24-pop-i" value="-1"><input id="v24-pop-t" class="form-control" placeholder="Título"><textarea id="v24-pop-p" class="form-control" rows="4" placeholder="Passo a passo"></textarea>` : ''}`,
    ed ? `<button class="btn-primary" onclick="v24SalvarPOP()">Salvar procedimento</button>` : '');
};
window.v24FiltrarPOPs = function (v) { abrirPOPs(v); const i = $('v24-pop-busca'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } };
window.v24EditarPOP = function (i) { const p = listaPOPs()[i]; if (!p) return; $('v24-pop-i').value = i; $('v24-pop-t').value = p.t; $('v24-pop-p').value = p.p; $('v24-pop-form-tit').textContent = 'Editar procedimento'; $('v24-pop-t').focus(); };
window.v24SalvarPOP = function () {
  if (!podeEditarPOPs()) return; const t = $('v24-pop-t').value.trim(), p = $('v24-pop-p').value.trim(), i = Number($('v24-pop-i').value);
  if (!t || !p) { alert('Preencha título e passo a passo.'); return; }
  const l = listaPOPs(); if (i >= 0 && l[i]) Object.assign(l[i], { t, p, editadoPor: user()?.usuario, editadoEm: Date.now() }); else l.push({ t, p, criadoPor: user()?.usuario, criadoEm: Date.now() });
  salvar(); abrirPOPs();
};
window.v24ExcluirPOP = function (i) { if (!podeEditarPOPs() || !confirm('Excluir este procedimento?')) return; listaPOPs().splice(i, 1); salvar(); abrirPOPs(); };
window.adicionarPOP = window.v24SalvarPOP; window.excluirPOP = window.v24ExcluirPOP;

// ---------- Passagem de turno somente pelo PS ----------
const _finLabor = window.finalizarTurnoLabor;
if (typeof _finLabor === 'function') window.finalizarTurnoLabor = function () { if (!ehPS()) { alert('A passagem de turno é feita somente pelo Painel do Problem Solver (PS).'); return; } return _finLabor.apply(this, arguments); };

// ---------- Botões flutuantes recolhíveis ----------
function montarGaveta() {
  if ($('v24-gaveta')) return;
  const g = document.createElement('div'); g.id = 'v24-gaveta'; g.className = 'v24-gaveta' + (localStorage.getItem('hub_gaveta') === '1' ? ' aberta' : '');
  g.innerHTML = `<button class="v24-gaveta-aba" id="v24-gaveta-aba" aria-expanded="false" title="Ações rápidas">⋯<span class="v24-gaveta-badge" id="v24-gaveta-badge" hidden></span></button><div class="v24-gaveta-itens" id="v24-gaveta-itens"></div>`;
  document.body.appendChild(g);
  $('v24-gaveta-aba').onclick = () => { g.classList.toggle('aberta'); localStorage.setItem('hub_gaveta', g.classList.contains('aberta') ? '1' : '0'); $('v24-gaveta-aba').setAttribute('aria-expanded', g.classList.contains('aberta')); };
}
function organizarFlutuantes() {
  montarGaveta();
  const itens = $('v24-gaveta-itens');
  ['v23-fab', 'btn-chat-fab'].forEach(id => { const b = $(id); if (b && b.parentElement !== itens) itens.appendChild(b); });
  const fab = $('v23-fab'); if (fab) fab.addEventListener('click', () => $('v24-gaveta').classList.remove('aberta'), { once: false });
  $('v24-gaveta').style.display = user() ? '' : 'none';
  const n = Number($('badge-chat-count')?.textContent || 0), badge = $('v24-gaveta-badge');
  if (badge) { badge.hidden = !(n > 0); badge.textContent = n; }
}

// ---------- Visibilidade por tela ----------
function aplicarVisibilidade() {
  document.querySelectorAll('.v23-cmd[data-pops]').forEach(b => b.style.display = telaPermitePOPs() ? '' : 'none');
  organizarFlutuantes();
}
const _render = window.renderizarTelaAtiva;
if (typeof _render === 'function') window.renderizarTelaAtiva = function () { const r = _render.apply(this, arguments); try { aplicarVisibilidade(); } catch (e) {} return r; };
setInterval(() => { try { aplicarVisibilidade(); } catch (e) {} }, 1500);
document.addEventListener('DOMContentLoaded', () => { try { aplicarVisibilidade(); } catch (e) {} });

if (typeof module !== 'undefined') module.exports = { tempoPrevistoMin, statusReceb, ehPS, podeEditarPOPs, fatorPLS };
})();
