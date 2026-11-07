
// =========================================================
// HUB OPERACIONAL SGO03 - MOTOR LÓGICO COMPLETO (script.js)
// =========================================================

let usuarioLogado = null;
let submenuAtual = 'home_dashboard';
let abaGateAtual = 'entrada';
let ladoGateAtual = 'svc';
let abaPSIndividualAtual = 'posto';
let versaoEstadoLocal = 0;
let salvamentoPendente = false;
let importacaoPendente = false;
let filaSalvamento = Promise.resolve();
const selecaoColaboradores = new Set();

let bancoUsuarios = [];
let bancoDadosReps = [];
let listaRotasPlana = [];

const CATALOGO_FERRAMENTAS = [
    { id: 'colab_cadastro', nome: '👤 Cadastro Colaborador' },
    { id: 'colab_presenca', nome: '📋 G&G' },
    { id: 'colab_direcionamento', nome: '🧭 Direcionamento' },
    { id: 'colab_talentos', nome: '📊 Talentos (Matriz PLS/UNT)' },
    { id: 'colab_escala', nome: '🗓️ Escala de Trabalho' },
    { id: 'lab_calc', nome: '🧮 Calculadora HC' },
    { id: 'lab_otimizacao', nome: '🔤 Otimização de Labor' },
    { id: 'lab_esteira', nome: '⚡ Labor Esteira' },
    { id: 'lab_vol_chao', nome: '📦 Labor Volumoso em Chão' },
    { id: 'lab_vol_esteira', nome: '🔄 Labor Volumoso em Esteira' },
    { id: 'lab_auditoria', nome: '🔍 Labor Auditoria & Otimização' },
    { id: 'lab_layout', nome: '🧱 Labor Layout' },
    { id: 'lab_recebimento', nome: '📥 Labor Recebimento' },
    { id: 'lab_ps_gestao', nome: '🛠️ Gestão Problem Solver (PS)' },
    { id: 'lab_ps_individual', nome: '🎯 Problem Solver (PS)' },
    { id: 'lab_hh', nome: '⏱️ Hora a Hora (H/H)' },
    { id: 'exp_mapa_svc', nome: '🟦 Labor Pista SVC (Vagas 01-27)' },
    { id: 'exp_mapa_xd', nome: '🟧 Labor Pista XD (Vagas 28-58)' },
    { id: 'exp_xpt', nome: '🚛 Labor Carregamento XPT' },
    { id: 'exp_reports', nome: '📋 Central de Reports (WhatsApp)' },
    { id: 'adm_csv', nome: '📥 Carregar .CSV & Dados' },
    { id: 'adm_gestacional', nome: '👥 Banco Gestacional' },
    { id: 'adm_usuarios', nome: '🔐 Gestão de Utilizadores' }
];

const ATIVIDADES_DIRECIONAMENTO = {
    processamento: ["Recebimento", "Volumoso", "Volumoso em Esteira", "Esteira", "Layout"],
    auditoria: ["Auditoria SCV", "Otimização XPT", "Movimentação de Gaiolas"],
    expedicao: ["Aduanda SVC", "Aduanda XD", "Carregamento XPT"]
};

const POSTOS_TRABALHO_PS = [
    "VOLUMOSO", "TRATATIVAS BANCADA", "DEVOLUÇÃO XPT", "INVENTARIO",
    "RTS", "MAPA DE CALOR SVC", "MAPA DE CALOR XPT", "POKA YOKE",
    "ACOMPANHAMENTO EXPEDIÇÃO LM", "ACOMPANHAMENTO EXPEDIÇÃO XD",
    "ACOMPANHAMENTO EXPEDIÇÃO XPT", "RECEBIMENTO"
];

const MENUS_COM_POOL = [
    'lab_esteira', 'lab_vol_chao', 'lab_vol_esteira', 'lab_auditoria',
    'exp_mapa_svc', 'exp_mapa_xd', 'exp_xpt', 'lab_layout', 'lab_recebimento'
];

const MENUS_EXPEDICAO_COM_ROTAS = ['exp_mapa_svc', 'exp_mapa_xd', 'exp_xpt'];

// Estrutura de 6 Bancadas (3 linhas x 2 bancadas) + Ilhas por Letra + GOL no fim da esteira
function novoLadoEsteira(lado) {
    return { id: lado, nome: lado === 'XPT' ? 'Lado XPT' : 'Lado LM', inducao: [], bipador: [], etiquetador: [], apoio: [], apoioFim: [] };
}
// v9 — exactly 20 island slots per side; slot order = position in the spreadsheet.
const TOTAL_ILHAS_LADO = 20;
function novaIlhaVazia(lado, letra = '') { return { letra, lado, ids: [], pacotes: 0, sorting: [], pesca: [], apoio: [], status: '' }; }
// v13 — no bulky deduction on the labor: IDs count their raw packages.
// IDs (carts) are grouped into optimized letters in "Otimização de Labor"; letters then
// sit in the side bank "Ilhas" and are pushed onto island slots to build the layout.
function bancoIds() { return ((estadoColetivo && estadoColetivo.rotasLabor) || []).filter(r => r && r.id_otimizado); }
function pacotesId(id) {
    const r = bancoIds().find(x => x.id_otimizado === id);
    return r ? Number(r.spr) || 0 : 0;
}
function letrasOtimizadas() {
    if (!Array.isArray(estadoColetivo.letrasOtim)) estadoColetivo.letrasOtim = [];
    const validos = new Set(bancoIds().map(r => r.id_otimizado));
    estadoColetivo.letrasOtim.forEach(l => { l.ids = (l.ids || []).filter(id => validos.has(id)); });
    return estadoColetivo.letrasOtim;
}
function letraPorNome(nome) {
    const n = String(nome || '').trim().toUpperCase();
    return n ? letrasOtimizadas().find(l => l.letra === n) : undefined;
}
function idsDaIlha(il) {
    const l = il && letraPorNome(il.letra);
    return l ? l.ids : [];
}
function pacotesIlhaLabor(il) { return idsDaIlha(il).reduce((s, id) => s + pacotesId(id), 0); }
function pacotesLetra(l) { return (l.ids || []).reduce((s, id) => s + pacotesId(id), 0); }
function idsEmLetras() { const set = new Set(); letrasOtimizadas().forEach(l => l.ids.forEach(id => set.add(id))); return set; }
function criarLetraOtimizada(nome) {
    const n = String(nome || '').trim().toUpperCase();
    if (!n) return false;
    if (letraPorNome(n)) { alert('A letra ' + n + ' já existe.'); return false; }
    letrasOtimizadas().push({ letra: n, ids: [] });
    return true;
}
function excluirLetraOtimizada(nome) {
    estadoColetivo.letrasOtim = letrasOtimizadas().filter(l => l.letra !== nome);
}
function colocarIdNaLetra(id, nome) {
    const alvo = letraPorNome(nome);
    if (!alvo || !bancoIds().some(r => r.id_otimizado === id)) return false;
    letrasOtimizadas().forEach(l => { l.ids = l.ids.filter(x => x !== id); });
    alvo.ids.push(id);
    return true;
}
function tirarIdDasLetras(id) { letrasOtimizadas().forEach(l => { l.ids = l.ids.filter(x => x !== id); }); }
function letrasNaLabor(est) { return new Set(est.ilhas.map(il => String(il.letra || '').trim().toUpperCase()).filter(Boolean)); }
function colocarLetraNaIlha(nome, destino) {
    const est = obterObjetoEsteiraAtiva();
    if (!est.ilhas[destino] || !letraPorNome(nome)) return false;
    est.ilhas.forEach(il => { if (String(il.letra || '').toUpperCase() === nome) il.letra = ''; });
    est.ilhas[destino].letra = nome;
    return true;
}
function iniciarDragId(ev, id) { ev.stopPropagation(); ev.dataTransfer.setData('text/plain', JSON.stringify({ tipo: 'ID_ROTA', id })); }
function iniciarDragLetra(ev, letra) { ev.stopPropagation(); ev.dataTransfer.setData('text/plain', JSON.stringify({ tipo: 'LETRA', letra })); }
function lerDrag(ev) { ev.preventDefault(); ev.currentTarget.classList.remove('drag-over'); try { return JSON.parse(ev.dataTransfer.getData('text/plain')); } catch (e) { return {}; } }
function dropIdNaLetra(ev, nome) { const d = lerDrag(ev); if (d.tipo === 'ID_ROTA' && colocarIdNaLetra(d.id, nome)) { salvarEstadoColetivoSQLite(); renderizarTelaAtiva(); } }
function dropIdNoBanco(ev) { const d = lerDrag(ev); if (d.tipo === 'ID_ROTA') { tirarIdDasLetras(d.id); salvarEstadoColetivoSQLite(); renderizarTelaAtiva(); } }
function dropLetraNoBanco(ev) {
    const d = lerDrag(ev);
    if (d.tipo !== 'LETRA') return;
    obterObjetoEsteiraAtiva().ilhas.forEach(il => { if (String(il.letra || '').toUpperCase() === d.letra) il.letra = ''; });
    salvarEstadoColetivoSQLite(); renderizarTelaAtiva();
}
function acaoCriarLetra() {
    const inp = document.getElementById('otim-nova-letra');
    if (inp && criarLetraOtimizada(inp.value)) { inp.value = ''; salvarEstadoColetivoSQLite(); renderizarTelaAtiva(); }
}
function acaoExcluirLetra(nome) { excluirLetraOtimizada(nome); salvarEstadoColetivoSQLite(); renderizarTelaAtiva(); }
function acaoTirarId(id) { tirarIdDasLetras(id); salvarEstadoColetivoSQLite(); renderizarTelaAtiva(); }
const jsArg = v => escapeHTML(v).replace(/'/g, "\\'");
let bancoLetrasAberto = (() => { try { return localStorage.getItem('hub_banco_letras') !== '0'; } catch (e) { return true; } })();
let letraSelecionadaLabor = '';
let idsSelecionadosOtim = new Set();
let filtroIdsOtim = '';
function alternarBancoLetras() { bancoLetrasAberto = !bancoLetrasAberto; try { localStorage.setItem('hub_banco_letras', bancoLetrasAberto ? '1' : '0'); } catch (e) {} renderizarTelaAtiva(); }
function selecionarLetraLabor(l) { letraSelecionadaLabor = letraSelecionadaLabor === l ? '' : l; renderizarTelaAtiva(); }
function clicarIlhaLabor(i) {
    if (!letraSelecionadaLabor) return;
    if (colocarLetraNaIlha(letraSelecionadaLabor, i)) { letraSelecionadaLabor = ''; salvarEstadoColetivoSQLite(); }
    renderizarTelaAtiva();
}
function alternarIdOtim(id) { idsSelecionadosOtim.has(id) ? idsSelecionadosOtim.delete(id) : idsSelecionadosOtim.add(id); renderizarOtimizacaoLabor(); }
function selecionarVisiveisOtim(marcar) {
    const usados = idsEmLetras();
    bancoIds().filter(r => !usados.has(r.id_otimizado) && r.id_otimizado.toUpperCase().includes(filtroIdsOtim)).forEach(r => marcar ? idsSelecionadosOtim.add(r.id_otimizado) : idsSelecionadosOtim.delete(r.id_otimizado));
    renderizarOtimizacaoLabor();
}
function filtrarIdsOtim(v) { filtroIdsOtim = String(v || '').trim().toUpperCase(); renderizarOtimizacaoLabor(); const i = document.getElementById('otim-busca'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
function moverSelecionadosParaLetra(nome) {
    if (!idsSelecionadosOtim.size) { alert('Selecione os IDs primeiro (toque nos carrinhos).'); return; }
    let n = 0; idsSelecionadosOtim.forEach(id => { if (colocarIdNaLetra(id, nome)) n++; });
    idsSelecionadosOtim.clear();
    if (n) salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}
function renderizarOtimizacaoLabor() {
    const el = document.getElementById('container-otimizacao-labor');
    if (!el) return;
    const usados = idsEmLetras();
    const livres = bancoIds().filter(r => !usados.has(r.id_otimizado));
    [...idsSelecionadosOtim].forEach(id => { if (usados.has(id)) idsSelecionadosOtim.delete(id); });
    const visiveis = livres.filter(r => r.id_otimizado.toUpperCase().includes(filtroIdsOtim));
    const nSel = idsSelecionadosOtim.size;
    const pctSel = [...idsSelecionadosOtim].reduce((t, id) => t + pacotesId(id), 0);
    el.innerHTML = `
      <div class="otim-barra">
        <input id="otim-nova-letra" class="form-control" placeholder="Nova letra (ex: A, >A, O / >C)" onkeydown="if(event.key==='Enter')acaoCriarLetra()">
        <button class="btn-primary" onclick="acaoCriarLetra()">➕ Criar letra</button>
      </div>
      <div class="banco-ids">
        <div class="otim-sel-barra">
          <b>🛒 IDs livres (${livres.length})</b>
          <input id="otim-busca" class="form-control" placeholder="🔍 filtrar (ex: E>, X1)" value="${escapeHTML(filtroIdsOtim)}" oninput="filtrarIdsOtim(this.value)">
          <button class="otim-btn" onclick="selecionarVisiveisOtim(true)">Marcar visíveis</button>
          <button class="otim-btn" onclick="selecionarVisiveisOtim(false)">Desmarcar</button>
          <span class="otim-sel-info">${nSel ? `✔ ${nSel} selecionado(s) • 📦 ${pctSel} — toque em “Colocar aqui” na letra` : 'Toque nos IDs para selecionar'}</span>
        </div>
        <div class="otim-ids-lista">${visiveis.map(r => `<button type="button" class="chip-id chip-sel ${idsSelecionadosOtim.has(r.id_otimizado) ? 'sel' : ''}" aria-pressed="${idsSelecionadosOtim.has(r.id_otimizado)}" onclick="alternarIdOtim('${jsArg(r.id_otimizado)}')">${escapeHTML(r.id_otimizado)} <small>${pacotesId(r.id_otimizado)}</small></button>`).join('') || '<span class="chip-vazio">' + (bancoIds().length ? (livres.length ? 'Nenhum ID com esse filtro.' : 'Todos os IDs já estão em letras.') : 'Importe o CSV de Otimização de Rotas para ver os IDs.') + '</span>'}</div>
      </div>
      <div class="otim-letras">
        ${letrasOtimizadas().map(l => `<div class="otim-letra">
            <div class="otim-letra-cab"><b>${escapeHTML(l.letra)}</b><span>📦 ${pacotesLetra(l)} • ${l.ids.length} ID(s)</span><button onclick="acaoExcluirLetra('${jsArg(l.letra)}')" aria-label="Excluir letra ${escapeHTML(l.letra)}">🗑</button></div>
            <button class="btn-primary otim-colocar" ${nSel ? '' : 'disabled'} onclick="moverSelecionadosParaLetra('${jsArg(l.letra)}')">⬇ Colocar aqui${nSel ? ' (' + nSel + ')' : ''}</button>
            <div class="otim-letra-ids">${l.ids.map(id => `<span class="chip-id">${escapeHTML(id)} <small>${pacotesId(id)}</small><button onclick="acaoTirarId('${jsArg(id)}')" aria-label="Tirar ${escapeHTML(id)} da letra">✕</button></span>`).join('') || '<span class="chip-vazio">sem IDs</span>'}</div>
          </div>`).join('') || '<p class="chip-vazio">Crie uma letra, selecione os IDs e toque em “Colocar aqui”.</p>'}
      </div>`;
}
// v10 — shared fishing: a leader island covers itself plus the next 1–2 islands on the same side.
function mapaPescaUnida(est) {
    const lider = est.ilhas.map((_, i) => i);
    ['LM','XPT'].forEach(l => {
        const ids = []; est.ilhas.forEach((il, i) => il.lado === l && ids.push(i));
        for (let k = 0; k < ids.length; k++) {
            const n = Math.max(1, Math.min(3, Number(est.ilhas[ids[k]].pescaGrupo) || 1));
            for (let j = 1; j < n && k + j < ids.length; j++) lider[ids[k + j]] = ids[k];
            k += n - 1;
        }
    });
    return lider;
}
function definirPescaGrupo(idx, n) {
    const est = obterObjetoEsteiraAtiva();
    est.ilhas[idx].pescaGrupo = Math.max(1, Math.min(3, Number(n) || 1));
    const lider = mapaPescaUnida(est);
    est.ilhas.forEach((il, i) => {
        if (lider[i] !== i) { // covered island: its fishers move to the leader
            const alvo = est.ilhas[lider[i]].pesca;
            (il.pesca || []).forEach(x => !alvo.includes(x) && alvo.push(x));
            il.pesca = []; il.pescaGrupo = 1;
        }
    });
    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}
function normalizarIlhas40(ilhas) {
    const lados = { LM: [], XPT: [] };
    (ilhas || []).forEach(il => lados[il && il.lado === 'XPT' ? 'XPT' : 'LM'].push(il));
    [['LM','XPT'],['XPT','LM']].forEach(([l, o]) => {
        while (lados[l].length > TOTAL_ILHAS_LADO) {
            const il = lados[l].pop();
            if (il.letra && lados[o].length < TOTAL_ILHAS_LADO) lados[o].push(il);
        }
    });
    const out = [];
    ['LM','XPT'].forEach(l => {
        while (lados[l].length < TOTAL_ILHAS_LADO) lados[l].push(novaIlhaVazia(l));
        lados[l].forEach(il => out.push({ ...novaIlhaVazia(l), ...il, lado: l,
            sorting: il.sorting || [], pesca: il.pesca || [], apoio: il.apoio || [] }));
    });
    return out;
}
function criarEstruturaEsteiraIlhasPadrao() {
    const e = criarEstruturaEsteiraIlhasBase();
    e.ilhas = normalizarIlhas40(e.ilhas);
    return e;
}
function criarEstruturaEsteiraIlhasBase() {
    const ilha = (letra, lado) => ({ letra, lado, pacotes: 0, sorting: [], pesca: [], apoio: [] });
    return {
        formato: 'planilha',
        // bancadas6[0] = Lado LM, bancadas6[1] = Lado XPT (layout espelhado da planilha)
        bancadas6: [novoLadoEsteira('LM'), novoLadoEsteira('XPT')],
        ilhas: [
            ilha('O / >C', 'LM'), ilha('N / T', 'LM'), ilha('V / G', 'LM'), ilha('F / S', 'LM'),
            ilha('H / J', 'LM'), ilha('K / >A', 'LM'), ilha('P / U', 'LM'), ilha('Q / L', 'LM'), ilha('R', 'LM'),
            ilha('A', 'XPT'), ilha('B', 'XPT'), ilha('D', 'XPT'), ilha('E', 'XPT'),
            ilha('X (SACAS)', 'XPT'), ilha('Y (SACAS)', 'XPT'), ilha('Z (SACAS)', 'XPT'), ilha('>E', 'XPT'), ilha('>X', 'XPT')
        ].concat([]),
        gol: []
    };
}

// Converte estados antigos (6 bancadas / gol único / apoio por ilha) para o formato da planilha
function migrarEsteiraParaFormatoPlanilha(obj) {
    if (!obj || !Array.isArray(obj.bancadas6)) return criarEstruturaEsteiraIlhasPadrao();
    if (obj.formato === 'planilha' && obj.bancadas6.length === 2) {
        obj.bancadas6.forEach(b => ['inducao','bipador','etiquetador','apoio','apoioFim','gol'].forEach(k => { if (!Array.isArray(b[k])) b[k] = []; }));
        if (!Array.isArray(obj.gol)) obj.gol = [];
        obj.bancadas6.forEach(b => { (b.gol || []).forEach(n => n && !obj.gol.includes(n) && obj.gol.push(n)); delete b.gol; });
        obj.ilhas = normalizarIlhas40(obj.ilhas);
        return obj;
    }
    const lm = novoLadoEsteira('LM'), xpt = novoLadoEsteira('XPT');
    const golUnico = [];
    obj.bancadas6.forEach((b, i) => {
        const alvo = (b.id === 'XPT' || (typeof b.id === 'number' ? b.id > 3 : i > 2)) ? xpt : lm;
        ['inducao','bipador','etiquetador','apoio','apoioFim'].forEach(k => (b[k] || []).forEach(n => n && alvo[k].push(n)));
        (b.gol || []).forEach(n => n && golUnico.push(n));
    });
    (obj.ilhas || []).forEach(il => {
        const alvo = il.lado === 'XPT' ? xpt : lm;
        (il.apoio || []).forEach(n => n && alvo.apoio.push(n));
        il.apoio = []; il.sorting = il.sorting || []; il.pesca = il.pesca || [];
    });
    (obj.gol || []).forEach(n => n && golUnico.push(n));
    obj.gol = golUnico;
    obj.bancadas6 = [lm, xpt];
    obj.formato = 'planilha';
    obj.ilhas = normalizarIlhas40(obj.ilhas);
    return obj;
}

// Estrutura intocada da Labor Volumoso em Chão
function criarEstruturaVolumosoChaoPadrao() {
    return {
        bancadas: [
            { nome: "Bancada 1", onbip: "", apoios: ["", "", ""] },
            { nome: "Bancada 2", onbip: "", apoios: ["", "", ""] },
            { nome: "Bancada 3", onbip: "", apoios: ["", "", ""] },
            { nome: "Bancada 4", onbip: "", apoios: ["", "", ""] },
            { nome: "Bancada 5", onbip: "", apoios: ["", "", ""] }
        ],
        separadoresLM: Array(20).fill(""),
        separadoresXPT: Array(20).fill(""),
        extras: {
            "5S": ["", ""],
            "Movimentador": ["", ""],
            "Bulky": ["", ""]
        }
    };
}

let estadoColetivo = {
    versao: 0,
    totalPacotesDiaCSV: 9000,
    repsEstado: {},
    pedidosApoioGG: [],
    labEsteira: criarEstruturaEsteiraIlhasPadrao(),
    labVolEsteira: criarEstruturaEsteiraIlhasPadrao(),
    labVolChao: criarEstruturaVolumosoChaoPadrao(),
    labAuditoria: {
        rotasAuditadasSVC: {},
        auditoriaSVC: [],
        otimizacaoXPT: [],
        movimentarSVC: [],
        movimentarXD: []
    },
    xptEquipes: [
        { legenda: "Quadro 1 - Clique p/ editar legenda", rep2: "", reps: ["", "", "", "", ""] },
        { legenda: "Quadro 2 - Clique p/ editar legenda", rep2: "", reps: ["", "", "", "", ""] },
        { legenda: "Quadro 3 - Clique p/ editar legenda", rep2: "", reps: ["", "", "", "", ""] },
        { legenda: "Quadro 4 - Clique p/ editar legenda", rep2: "", reps: ["", "", "", "", ""] },
        { legenda: "Quadro 5 - Clique p/ editar legenda", rep2: "", reps: ["", "", "", "", ""] },
        { legenda: "Quadro 6 - Clique p/ editar legenda", rep2: "", reps: ["", "", "", "", ""] }
    ],
    recebEquipes: Array.from({ length: 6 }, (_, i) => ({ legenda: `Quadro ${i + 1} - Clique p/ editar legenda`, rep2: "", reps: ["", "", "", "", ""] })),
    labLayout: { titulo: "Layout — clique para escrever", vagas: ["", "", "", "", ""] },
    pedidosPuxar: [],
    vagasPista: {},
    psPostos: {},     // { "login": { postos: ["POKA YOKE", "RTS"], repApoio: "", extra: "" } }
    psTarefas: [],    // [ { id, hora, descricao, responsavel, repApoio, status, justificativa, pediuApoio, temFoto } ]
    psDuvidas: [],    // [ { id, autor, texto, hora, orientacoes: [], assumidoPor: "", temFoto } ]
    psPedidosTL: [],  // [ { id, autor, hora, tipo, descricao, status } ]
    horaHora: {}
};

// =========================================================
// 1. UTILITÁRIOS, RADAR SVG E CARTÕES DE COLABORADOR
// =========================================================
function numMatriz(val) {
    if (val === undefined || val === null || val === '-' || val === '') return 0;
    const limpo = String(val).replace('%', '').replace(',', '.').trim();
    const n = parseFloat(limpo);
    return isNaN(n) ? 0 : n;
}

function corPorNotaMatriz(notaStr) {
    if (!notaStr || notaStr === '-') return '#334155';
    const n = numMatriz(notaStr);
    if (n >= 8) return '#10b981';
    if (n >= 5) return '#f59e0b';
    return '#ef4444';
}

function statusColaborador(nome) {
    return (estadoColetivo.repsEstado[nome] || {}).statusPresenca || 'Não informado';
}

function retornoIntervaloColaborador(nome) {
    return estadoColetivo.repsEstado[nome]?.retornoOperacional || '';
}

function estaDisponivelParaEscala(nome) {
    const st = statusColaborador(nome);
    return st === 'Presente' || st === 'Escalado';
}

function gerarGraficoCircularSVG(colab) {
    if (!colab) return '';
    const corVol = corRadarPLS(colab, 'volumoso');
    const corBan = corRadarPLS(colab, 'bancada');
    const corSor = corRadarPLS(colab, 'sorting');
    const corAdu = corRadarPLS(colab, 'aduana');
    const notaOp = colab.aval_operador && colab.aval_operador !== '-' ? colab.aval_operador : '-';
    const nEsc = colab.nome.replace(/'/g, "\\'");

    return `
        <div class="radar-donut-wrap"
             onmouseenter="mostrarPopupRadar(event, '${nEsc}')"
             onmouseleave="ocultarPopupRadar()"
             onclick="mostrarPopupRadar(event, '${nEsc}')">
            <svg class="radar-svg" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="14" fill="#0b0f19" stroke="#1e293b" stroke-width="4"></circle>
                <circle cx="18" cy="18" r="14" fill="transparent" stroke="${corVol}" stroke-width="4.2" stroke-dasharray="${comprimentoRadarPLS(colab, 'volumoso')} 88" stroke-dashoffset="22"></circle>
                <circle cx="18" cy="18" r="14" fill="transparent" stroke="${corBan}" stroke-width="4.2" stroke-dasharray="${comprimentoRadarPLS(colab, 'bancada')} 88" stroke-dashoffset="0"></circle>
                <circle cx="18" cy="18" r="14" fill="transparent" stroke="${corSor}" stroke-width="4.2" stroke-dasharray="${comprimentoRadarPLS(colab, 'sorting')} 88" stroke-dashoffset="-22"></circle>
                <circle cx="18" cy="18" r="14" fill="transparent" stroke="${corAdu}" stroke-width="4.2" stroke-dasharray="${comprimentoRadarPLS(colab, 'aduana')} 88" stroke-dashoffset="-44"></circle>
                <text x="18" y="21" text-anchor="middle" fill="#ffe600" font-size="8.5" font-weight="900">${notaOp}</text>
            </svg>
        </div>
    `;
}

function mostrarPopupRadar(ev, nome) {
    const c = bancoDadosReps.find(x => x.nome === nome);
    const pop = document.getElementById('radar-popup-tooltip');
    if (!c || !pop) return;

    const st = statusColaborador(nome);
    const ret = retornoIntervaloColaborador(nome);

    pop.innerHTML = `
        <div style="font-weight:900; color:var(--primary); font-size:12px; margin-bottom:4px; border-bottom:1px solid #2a344d; padding-bottom:4px;">
            📊 ${c.nome} (${c.vinculo})
        </div>
        <div style="margin-bottom:4px; font-size:10.5px;">
            Status: <b>${st}</b> ${st === 'Intervalo' && ret ? `<span class="badge-retorno-intervalo">⏳ Ret: ${ret}</span>` : ''}
        </div>
        <div><b style="color:${corPorNotaMatriz(c.aval_volumoso)}">● Volumoso:</b> Nota ${c.aval_volumoso} | PLS: <b>${c.pls_volumoso}</b> | UNT: ${c.unt_volumoso}</div>
        <div><b style="color:${corPorNotaMatriz(c.aval_bancada)}">● Bancada:</b> Nota ${c.aval_bancada} | PLS: <b>${c.pls_bancada}</b> | UNT: ${c.unt_bancada}</div>
        <div><b style="color:${corPorNotaMatriz(c.aval_sorting)}">● Sorting:</b> Nota ${c.aval_sorting} | PLS: <b>${c.pls_sorting}</b> | UNT: ${c.unt_sorting}</div>
        <div><b style="color:${corPorNotaMatriz(c.aval_aduana)}">● Aduana:</b> Nota ${c.aval_aduana} | PLS: <b>${c.pls_aduana}</b> | UNT: ${c.unt_aduana}</div>
        <div style="margin-top:4px; padding-top:4px; border-top:1px solid #2a344d; display:flex; justify-content:space-between;">
            <span>Não Sist.: <b>${c.aval_nao_sist}</b></span>
            <span>5S: <b>${c.aval_5s}</b></span>
            <span style="color:var(--primary);">Operador: <b>${c.aval_operador}</b></span>
        </div>
    `;
    pop.style.display = 'block';
    pop.style.left = Math.min(window.innerWidth - 285, ev.clientX + 14) + 'px';
    pop.style.top = Math.min(window.innerHeight - 190, ev.clientY + 14) + 'px';
}

function ocultarPopupRadar() {
    const pop = document.getElementById('radar-popup-tooltip');
    if (pop) pop.style.display = 'none';
}

// A body-level tooltip must not outlive its card, screen or pointer context.
document.addEventListener('pointerdown', ev => {
    if (!ev.target.closest?.('.radar-donut-wrap, .btn-local-gg')) ocultarPopupRadar();
}, true);
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') ocultarPopupRadar(); });
document.addEventListener('scroll', ocultarPopupRadar, true);
document.addEventListener('visibilitychange', ocultarPopupRadar);
if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('blur', ocultarPopupRadar);
    window.addEventListener('resize', ocultarPopupRadar);
}

function renderizarMiniCardAlocado(nome, tipoPostoPLS, onClickRemoverJs) {
    if (!nome) return '';
    const cObj = bancoDadosReps.find(x => x.nome === nome);
    const st = statusOperacionalColaborador(nome);
    const ret = retornoIntervaloColaborador(nome);
    const emInt = st === 'Intervalo';
    const emOcioso = st === 'Ocioso';
    const nEsc = nome.replace(/'/g, "\\'");

    return `
        <div class="slot-rep-esteira ${emInt ? 'card-em-intervalo' : ''}"
             draggable="${!emInt}"
             ondragstart="iniciarDragRep(event, '${nEsc}')">
            <div style="display:flex; align-items:center; gap:5px; min-width:0;">
                ${cObj ? gerarGraficoCircularSVG(cObj) : ''}
                <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    <span>${escapeHTML(nome.split(' ').slice(0, 2).join(' '))}</span><br>${badgeCargo(cObj)}
                    ${emInt ? `<br><span class="badge-retorno-intervalo">⏳ Ret ${ret || '--:--'}</span>` : ''}
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:3px; flex-shrink:0;">
                ${botaoStatusOperacional(nome)}
                <button class="btn-close-sidebar" style="width:18px;height:18px;font-size:10px;" onclick="${onClickRemoverJs}" title="Devolver ao banco">✕</button>
            </div>
        </div>
    `;
}

// =========================================================
// 2. INICIALIZAÇÃO, LOGIN E SESSÃO F5 PERSISTENTE
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
    inicializarTabela6HorasHH();
    popularCheckboxesPermissoesADM();
    restaurarSessaoF5();
    iniciarLoopsSincronizacao();
});

function restaurarSessaoF5() {
    const aba=localStorage.getItem('hub_sgo03_aba_v13') || 'home_dashboard';
    fetch('/api/sessao').then(r=>r.json()).then(d=>{ if(d.usuario){usuarioLogado=d.usuario;entrarNoAppShell(aba);} else localStorage.removeItem('hub_sgo03_sessao_v13'); });
}

function fazerLogin() {
    const uInp = (document.getElementById('login-user').value || '').trim().toLowerCase().replace('@', '');
    const pInp = (document.getElementById('login-pass').value || '').trim();
    const erroEl = document.getElementById('login-erro');

    if (!uInp || !pInp) {
        erroEl.innerText = '⚠️ Preencha utilizador e PIN.';
        return;
    }

    fetch('/api/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:uInp,senha:pInp})})
      .then(r=>r.json()).then(d=>{if(!d.sucesso){erroEl.innerText='Credenciais incorretas.';return;}usuarioLogado=d.usuario;entrarNoAppShell('home_dashboard');})
      .catch(()=>{erroEl.innerText='Erro de ligação ao servidor Flask.';});
}

function entrarNoAppShell(abaDestino) {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';

    const nomeCargo = `${usuarioLogado.nome} ${usuarioLogado.cargo || 'OPS III'}`.toUpperCase();
    document.getElementById('home-nome-usuario').innerText = nomeCargo;
    document.getElementById('badge-cargo-ativo').innerText = nomeCargo;
    document.getElementById('lbl-ps-user').innerText = `@${usuarioLogado.usuario} (${nomeCargo})`;

    sincronizarDadosCompletos(() => {
        aplicarVisibilidadePermissoesMenu();
        mudarSubmenu(abaDestino || 'home_dashboard');
        carregarMensagensChat();
        verificarPassagemTurno();
    });
}

function fazerLogout() {
    ocultarPopupRadar();
    fetch('/api/logout',{method:'POST'});
    localStorage.removeItem('hub_sgo03_sessao_v13');
    localStorage.removeItem('hub_sgo03_aba_v13');
    usuarioLogado = null;
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('login-overlay').style.display = 'flex';
}

function temPermissaoMenu(idMenu) {
    if (!usuarioLogado) return false;
    if (idMenu === 'exp_gate') return false;
    if (idMenu === 'exp_reports') return usuarioLogado.cargo === 'ADM';
    if (idMenu === 'home_dashboard') return true;
    if (idMenu === 'adm_gestacional') return ['ADM','TL'].includes(usuarioLogado.cargo);
    if (idMenu === 'adm_usuarios') return usuarioLogado.cargo === 'ADM';
    const ac = String(usuarioLogado.acessos || 'todos').toLowerCase();
    if (ac === 'todos') return true;
    return ac.split(',').map(s => s.trim()).includes(idMenu.toLowerCase());
}

function aplicarVisibilidadePermissoesMenu() {
    CATALOGO_FERRAMENTAS.forEach(f => {
        const btn = document.getElementById('sub-' + f.id);
        if (btn) btn.style.display = temPermissaoMenu(f.id) ? 'flex' : 'none';
    });
}

// =========================================================
// 3. NAVEGAÇÃO, FAVORITOS E VISIBILIDADE DO POOL / G&G
// =========================================================
function toggleDrawer() { document.getElementById('pista-drawer').classList.toggle('recolhida'); }
function toggleGaveta(id) { document.getElementById(id).classList.toggle('aberta'); }
function toggleSidebarRight() { document.getElementById('sidebar-right').classList.toggle('recolhida'); }

function alternarAbaSidebar(aba) {
    document.getElementById('tab-reps').classList.toggle('ativo', aba === 'reps');
    document.getElementById('tab-rotas').classList.toggle('ativo', aba === 'rotas');
    document.getElementById('lista-reps-container').classList.toggle('hidden', aba !== 'reps');
    document.getElementById('lista-rotas-container').classList.toggle('hidden', aba !== 'rotas');
}

function mudarSubmenu(codigo) {
    ocultarPopupRadar();
    if (!temPermissaoMenu(codigo)) {
        alert('🔒 Sem permissão de acesso para esta ferramenta.');
        return;
    }
    submenuAtual = codigo;
    localStorage.setItem('hub_sgo03_aba_v13', codigo);

    document.querySelectorAll('.btn-drawer-item').forEach(b => b.classList.remove('ativo'));
    const btnAtivo = document.getElementById('sub-' + codigo);
    if (btnAtivo) btnAtivo.classList.add('ativo');

    document.querySelectorAll('.view-panel').forEach(p => p.style.display = 'none');

    const mostrarPool = MENUS_COM_POOL.includes(codigo);
    const sbRight = document.getElementById('sidebar-right');
    const btnGG = document.getElementById('btn-gente-gestao');
    const btnPoolTopo = document.getElementById('btn-toggle-pool-topo');
    const tabRotas = document.getElementById('tab-rotas');

    if (mostrarPool) {
        sbRight.style.display = 'flex';
        sbRight.classList.remove('recolhida');
        btnGG.style.display = 'inline-flex';
        btnPoolTopo.style.display = 'inline-flex';

        const ehExpedicao = MENUS_EXPEDICAO_COM_ROTAS.includes(codigo);
        tabRotas.style.display = ehExpedicao ? 'inline-block' : 'none';
        if (!ehExpedicao) alternarAbaSidebar('reps');
    } else {
        sbRight.style.display = 'none';
        btnGG.style.display = 'none';
        btnPoolTopo.style.display = 'none';
    }

    const titulos = {
        home_dashboard: 'Painel de Boas-Vindas',
        colab_cadastro: 'Cadastro Colaborador',
        colab_presenca: 'G&G',
        colab_direcionamento: 'Direcionamento',
        colab_talentos: 'Talentos (Matriz PLS/UNT)',
        colab_escala: 'Escala de Trabalho',
        lab_calc: 'Calculadora HC',
        lab_otimizacao: 'Otimização de Labor',
        lab_esteira: 'Labor Esteira',
        lab_vol_chao: 'Labor Volumoso em Chão',
        lab_vol_esteira: 'Labor Volumoso em Esteira',
        lab_auditoria: 'Labor Auditoria & Otimização',
        lab_layout: 'Labor Layout',
        lab_recebimento: 'Labor Recebimento',
        lab_ps_gestao: 'Gestão Problem Solver (PS)',
        lab_ps_individual: 'Problem Solver (PS)',
        lab_hh: 'Hora a Hora (H/H)',
        exp_mapa_svc: 'Labor Pista SVC',
        exp_mapa_xd: 'Labor Pista XD',
        exp_xpt: 'Labor Carregamento XPT',
        exp_reports: 'Central de Reports (WhatsApp)',
        adm_csv: 'Carregar .CSV & Dados',
        adm_gestacional: 'Banco Gestacional',
        adm_usuarios: 'Gestão de Utilizadores'
    };
    document.getElementById('label-setor-topo').innerText = titulos[codigo] || 'Hub Operacional';
    atualizarFerramentaExportarLabor(codigo);

    if (codigo === 'lab_esteira' || codigo === 'lab_vol_esteira') {
        document.getElementById('view-lab_esteira').style.display = 'flex';
    } else if (codigo === 'exp_mapa_svc' || codigo === 'exp_mapa_xd') {
        document.getElementById('view-operacao').style.display = 'flex';
    } else if (codigo === 'exp_gate') {
        document.getElementById('view-gate').style.display = 'flex';
    } else {
        const view = document.getElementById('view-' + codigo);
        if (view) view.style.display = 'flex';
    }

    renderizarTelaAtiva();
}

function renderizarTelaAtiva() {
    ocultarPopupRadar();
    renderizarBarraPedidosApoioGG();
    if (submenuAtual === 'home_dashboard') renderizarAtalhosFavoritos();
    if (submenuAtual === 'colab_cadastro') renderizarTabelaCadastroColabs();
    if (submenuAtual === 'colab_presenca') renderizarTabelaPresenca();
    if (submenuAtual === 'colab_direcionamento') renderizarTabelaDirecionamento();
    if (submenuAtual === 'colab_talentos') renderizarTabelaTalentos();
    if (submenuAtual === 'colab_escala') renderizarEscalaTrabalho();
    if (submenuAtual === 'lab_hh') atualizarCoresHH();
    if (submenuAtual === 'lab_calc') calcularCalculadoraHC();
    if (submenuAtual === 'lab_otimizacao') renderizarOtimizacaoLabor();
    if (submenuAtual === 'lab_esteira' || submenuAtual === 'lab_vol_esteira') renderizarTabuleiroEsteiraIlhas(submenuAtual);
    if (submenuAtual === 'lab_vol_chao') renderizarLaborVolumosoChao();
    if (submenuAtual === 'lab_auditoria') renderizarLaborAuditoria();
    if (submenuAtual === 'lab_ps_gestao') renderizarGestaoPS();
    if (submenuAtual === 'lab_ps_individual') renderizarPainelIndividualPS();
    if (submenuAtual === 'exp_mapa_svc') renderizarMapaVagasPista('SVC');
    if (submenuAtual === 'exp_mapa_xd') renderizarMapaVagasPista('XD');
    if (submenuAtual === 'exp_xpt') renderizarCarregamentoLabor();
    if (submenuAtual === 'exp_reports') renderizarCentralReports();
    if (submenuAtual === 'lab_recebimento') renderizarQuadrosXPT();
    if (submenuAtual === 'lab_layout') renderizarLaborLayout();
    if (submenuAtual === 'exp_gate') renderizarControleGateMobile();
    if (submenuAtual === 'adm_usuarios') renderizarUsuariosADM();
    if (submenuAtual === 'adm_gestacional') renderizarBancoGestacional();

    if (MENUS_COM_POOL.includes(submenuAtual)) {
        renderizarPoolIndividualizado();
        if (MENUS_EXPEDICAO_COM_ROTAS.includes(submenuAtual)) {
            renderizarStatusRotasSidebar();
        }
    }
}

// Favoritos do Painel de Boas-Vindas
function obterMeusFavoritos() {
    if (usuarioLogado && usuarioLogado.favoritos) {
        try {
            const parsed = typeof usuarioLogado.favoritos === 'string' ? JSON.parse(usuarioLogado.favoritos) : usuarioLogado.favoritos;
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (e) {}
    }
    const local = localStorage.getItem('hub_favs_' + (usuarioLogado ? usuarioLogado.usuario : 'default'));
    if (local) {
        try {
            const arr = JSON.parse(local);
            if (Array.isArray(arr) && arr.length > 0) return arr;
        } catch (e) {}
    }
    return ['colab_presenca', 'colab_direcionamento', 'lab_esteira', 'exp_mapa_svc', 'exp_reports', 'colab_talentos'];
}

function renderizarAtalhosFavoritos() {
    const box = document.getElementById('container-atalhos-favoritos');
    if (!box) return;
    const favs = obterMeusFavoritos().filter(id => temPermissaoMenu(id));
    box.innerHTML = favs.map(id => {
        const item = CATALOGO_FERRAMENTAS.find(f => f.id === id);
        if (!item) return '';
        return `
            <button class="btn-shortcut" onclick="mudarSubmenu('${item.id}')">
                <span>${item.nome}</span>
                <span style="color:var(--primary);">★</span>
            </button>
        `;
    }).join('') || '<p class="sub-hint">Clique em "⭐ Configurar Meus Atalhos Favoritos" para adicionar atalhos.</p>';
}

function abrirModalConfigurarFavoritos() {
    const grid = document.getElementById('grid-checkboxes-favoritos');
    const atuais = obterMeusFavoritos();
    grid.innerHTML = CATALOGO_FERRAMENTAS
        .filter(f => temPermissaoMenu(f.id))
        .map(f => `
            <label class="perm-item">
                <input type="checkbox" class="chk-fav-item" value="${f.id}" ${atuais.includes(f.id) ? 'checked' : ''}>
                <span>${f.nome}</span>
            </label>
        `).join('');
    document.getElementById('modal-favoritos').style.display = 'flex';
}

function fecharModalConfigurarFavoritos() {
    document.getElementById('modal-favoritos').style.display = 'none';
}

function salvarMeusFavoritos() {
    const marcados = Array.from(document.querySelectorAll('.chk-fav-item')).filter(c => c.checked).map(c => c.value);
    if (usuarioLogado) {
        usuarioLogado.favoritos = marcados;
        localStorage.setItem('hub_favs_' + usuarioLogado.usuario, JSON.stringify(marcados));
        localStorage.setItem('hub_sgo03_sessao_v13', JSON.stringify(usuarioLogado));
        fetch('/api/favoritos_usuario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: usuarioLogado.usuario, favoritos: marcados })
        });
    }
    fecharModalConfigurarFavoritos();
    renderizarAtalhosFavoritos();
}

// =========================================================
// 4. SINCRONIZAÇÃO COLETIVA E TRATAMENTO DE ROTAS SEM DUPLICIDADE
// =========================================================
function desduplicarRotasPorIdOtimizado(rotasCruas) {
    const mapa = new Map();
    (rotasCruas || []).forEach(r => {
        const codigo = String(r.id_otimizado || r.rota || '').trim().toUpperCase();
        if (!codigo) return;
        if (!mapa.has(codigo)) {
            mapa.set(codigo, {
                ...r,
                rota: codigo,
                id_otimizado: codigo,
                spr: parseInt(r.spr || 0) || 0
            });
        } else {
            // Se houver outra linha com o mesmo ID Otimizado, soma os pacotes sem duplicar a rota
            const ex = mapa.get(codigo);
            ex.spr += (parseInt(r.spr || 0) || 0);
            if (!ex.onda && r.onda) ex.onda = r.onda;
            if (r.status_gate && r.status_gate !== 'PENDENTE' && r.status_gate !== 'AGUARDANDO') {
                ex.status_gate = r.status_gate;
                ex.hora_entrada = r.hora_entrada || ex.hora_entrada;
                ex.hora_saida = r.hora_saida || ex.hora_saida;
                ex.timestamp_entrada = r.timestamp_entrada || ex.timestamp_entrada;
            }
        }
    });
    return Array.from(mapa.values());
}

function sincronizarDadosCompletos(cb) {
    return fetch('/api/dados_completos')
        .then(r => r.json())
        .then(d => {
            if (d.sucesso) {
                bancoUsuarios = d.usuarios || [];
                bancoDadosReps = d.reps || [];
                listaRotasPlana = desduplicarRotasPorIdOtimizado(d.listaRotas || []);
                popularSelectDestinatariosChat();
            }
            return fetch('/api/estado_coletivo');
        })
        .then(r => r.json())
        .then(estRemoto => {
            if (estRemoto && Object.keys(estRemoto).length > 0) {
                estadoColetivo = {
                    ...estadoColetivo,
                    ...estRemoto,
                    labEsteira: (estRemoto.labEsteira && estRemoto.labEsteira.bancadas6) ? estRemoto.labEsteira : estadoColetivo.labEsteira,
                    labVolEsteira: (estRemoto.labVolEsteira && estRemoto.labVolEsteira.bancadas6) ? estRemoto.labVolEsteira : estadoColetivo.labVolEsteira,
                    labVolChao: (estRemoto.labVolChao && estRemoto.labVolChao.bancadas) ? estRemoto.labVolChao : estadoColetivo.labVolChao
                };
                versaoEstadoLocal = estRemoto.versao || 0;
            }
            garantirEstadoInicialColaboradores();
            aplicarEscalaAutomaticaDoDia();
            sincronizarVagasComStatusGate();
            restaurarInputsTabelaHH();
            renderizarTelaAtiva();
            if (typeof lembrarEstadoAtual==='function') lembrarEstadoAtual();
            if (cb) cb();
        })
        .catch(e => { console.error('Erro sync:', e); throw e; });
}

function garantirEstadoInicialColaboradores() {
    if (!estadoColetivo.repsEstado) estadoColetivo.repsEstado = {};
    bancoDadosReps.forEach(c => {
        if (!estadoColetivo.repsEstado[c.nome]) {
            estadoColetivo.repsEstado[c.nome] = {
                statusPresenca: 'Não informado',
                horarioRetornoIntervalo: '',
                atividadesDirecionadas: []
            };
        }
    });
    bancoDadosReps.forEach(c => { const r=estadoColetivo.repsEstado[c.nome]; if (['Ocioso','5S','Intervalo'].includes(r.statusPresenca)) { r.statusOperacional=r.statusPresenca; r.statusPresenca='Presente'; } sincronizarLaborDirecionada(c.nome); });
}

function sincronizarVagasComStatusGate() {
    if (!estadoColetivo.vagasPista) estadoColetivo.vagasPista = {};
    // Garante que rotas EM_VAGA no banco constem com timer na vaga correta e rotas EXPEDIDAS/PENDENTES libertem a vaga
    listaRotasPlana.forEach(r => {
        const vNum = parseInt(String(r.vaga || '').replace(/\D/g, ''));
        if (!Number.isInteger(vNum) || vNum < 1 || vNum > 58) return;
        const setor = vNum >= 28 ? 'XD' : 'SVC';
        const vFmt = String(vNum).padStart(2, '0');
        const chave = `${setor}_${vFmt}`;

        if (r.status_gate === 'EM_VAGA') {
            const atual = estadoColetivo.vagasPista[chave] || {};
            estadoColetivo.vagasPista[chave] = {
                rota: r.rota,
                onda: r.onda || 'Onda 1',
                spr: r.spr || 0,
                rep: atual.rep || '',
                inicioTimer: r.timestamp_entrada || atual.inicioTimer || Date.now()
            };
        } else {
            if (r.status_gate === 'EXPEDIDA' && estadoColetivo.vagasPista[chave] && estadoColetivo.vagasPista[chave].rota === r.rota) {
                delete estadoColetivo.vagasPista[chave];
            }
        }
    });
}

function salvarEstadoColetivoSQLite() {
    salvamentoPendente = true;
    const pacote = JSON.stringify(estadoColetivo);
    filaSalvamento = filaSalvamento.catch(() => {}).then(async () => {
        const r = await fetch('/api/estado_coletivo', {method:'POST', headers:{'Content-Type':'application/json'}, body:pacote});
        const d = await r.json();
        if (r.status === 409) await sincronizarDadosCompletos();
        if (!r.ok || !d.sucesso) throw new Error(d.msg || 'Falha ao salvar');
        versaoEstadoLocal = d.versao;
        return d;
    });
    const atual = filaSalvamento;
    atual.then(() => { if (filaSalvamento === atual) salvamentoPendente = false; })
      .catch(() => { if (filaSalvamento === atual) salvamentoPendente = false; alert('Não foi possível salvar. Verifique a conexão antes de continuar.'); });
    return atual;
}

function verificarVinculoCadastro() {
    const v = document.getElementById('cad-colab-vinculo').value;
    document.getElementById('grupo-usuario-login').style.display = ['OPSII (PS)', 'OPS III', 'TL', 'REP II'].includes(v) ? 'flex' : 'none';
}

let colaboradorEmEdicao = '';
function salvarColaboradorCadastro() {
    const nome = (document.getElementById('cad-colab-nome').value || '').trim();
    const cargo = document.getElementById('cad-colab-vinculo').value;
    const usuario_login = (document.getElementById('cad-colab-login').value || '').trim().toLowerCase().replace('@', '');

    if (!nome) { alert('⚠️ Digite o nome completo do colaborador.'); return; }
    fetch('/api/colaboradores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, cargo, usuario_login, nome_original: colaboradorEmEdicao || '' })
    })
    .then(r => r.json())
    .then(d => {
        if (!d.sucesso) { alert(d.msg || 'Não foi possível salvar.'); return; }
        if (d.sucesso) {
            colaboradorEmEdicao = '';
            document.getElementById('cad-colab-nome').value = '';
            document.getElementById('cad-colab-login').value = '';
            sincronizarDadosCompletos();
        }
    });
}

function editarColaboradorCadastro(nome) {
    const c = bancoDadosReps.find(x => x.nome === nome);
    if (!c) return;
    colaboradorEmEdicao = c.nome;
    document.getElementById('cad-colab-nome').value = c.nome;
    document.getElementById('cad-colab-vinculo').value = c.cargo || c.vinculo || 'REP';
    verificarVinculoCadastro();
    document.getElementById('cad-colab-login').value = c.usuario_login || '';
}

function excluirColaboradorCadastro(nome) {
    if (!confirm(`Remover colaborador ${nome}?`)) return;
    fetch('/api/colaboradores?nome=' + encodeURIComponent(nome), { method: 'DELETE' })
        .then(() => sincronizarDadosCompletos());
}

function renderizarTabelaCadastroColabs() {
    const tbody = document.getElementById('tbody-cad-colabs');
    if (!tbody) return;
    const termo = (document.getElementById('busca-cadastro').value || '').toLocaleLowerCase();
    document.getElementById('count-cad-colabs').innerText = bancoDadosReps.length;
    tbody.innerHTML = bancoDadosReps.filter(c => `${c.nome} ${c.cargo || c.vinculo}`.toLocaleLowerCase().includes(termo)).map(c => {
        const n = c.nome.replace(/'/g, "\\'");
        return `<tr><td><input type="checkbox" aria-label="Selecionar ${escapeHTML(c.nome)}" ${selecaoColaboradores.has(c.nome)?'checked':''} onchange="selecionarColaborador('${n}',this.checked)"></td><td><b>${escapeHTML(c.nome)}</b></td><td>${escapeHTML(c.cargo || c.vinculo || 'REP')}</td><td>${escapeHTML(c.usuario_login || '-')}</td><td>${gerarGraficoCircularSVG(c)}</td><td><button class="btn-doca-sm" onclick="editarColaboradorCadastro('${n}')" title="Editar">✏️</button><button class="btn-doca-sm" onclick="excluirColaboradorCadastro('${n}')" title="Excluir">🗑️</button></td></tr>`;
    }).join('');
    document.getElementById('excluir-selecionados').disabled = selecaoColaboradores.size === 0;
}
function escapeHTML(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function selecionarColaborador(nome, marcado) { marcado ? selecaoColaboradores.add(nome) : selecaoColaboradores.delete(nome); document.getElementById('excluir-selecionados').disabled = !selecaoColaboradores.size; }
function selecionarTodosColaboradores(marcado) { document.querySelectorAll('#tbody-cad-colabs input[type=checkbox]').forEach(c => { c.checked=marcado; c.dispatchEvent(new Event('change')); }); }
async function excluirColaboradoresSelecionados() {
    if (!selecaoColaboradores.size || !confirm(`Excluir ${selecaoColaboradores.size} colaboradores selecionados?`)) return;
    try {
        const r = await fetch('/api/colaboradores', {method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nomes:[...selecaoColaboradores]})});
        if (!r.ok) throw new Error();
        selecaoColaboradores.clear(); sincronizarDadosCompletos();
    } catch { alert('Falha ao excluir colaboradores.'); }
}

function clicarBotaoOperandoOcioso(nome) { ciclarStatusOperacional(nome); }

function alterarStatusPresenca(nome, novoStatus) {
    if (!estadoColetivo.repsEstado[nome]) {
        estadoColetivo.repsEstado[nome] = { statusPresenca: novoStatus, horarioRetornoIntervalo: '', atividadesDirecionadas: [] };
    }
    estadoColetivo.repsEstado[nome].statusPresenca = novoStatus;

    if (novoStatus === 'Intervalo') {
        const agora = new Date();
        agora.setMinutes(agora.getMinutes() + 60);
        estadoColetivo.repsEstado[nome].horarioRetornoIntervalo = agora.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    } else {
        estadoColetivo.repsEstado[nome].horarioRetornoIntervalo = '';
    }


    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}

function alterarHorarioRetornoIntervalo(nome, novaHora) {
    if (estadoColetivo.repsEstado[nome]) {
        estadoColetivo.repsEstado[nome].horarioRetornoIntervalo = novaHora;
        salvarEstadoColetivoSQLite();
        renderizarTelaAtiva();
    }
}

function renderizarTabelaPresenca() {
    const tbody = document.getElementById('tbody-presenca-colabs');
    if (!tbody) return;
    const termo = (document.getElementById('filtro-presenca-nome').value || '').toLowerCase();

    const pesoOrdem = { 'Presente': 1, 'Ocioso': 2, '5S': 2.5, 'Intervalo': 3, 'Ausente': 4, 'DSR': 5, 'Afastado': 6 };

    const ordenados = bancoDadosReps
        .filter(c => c.nome.toLowerCase().includes(termo))
        .slice()
        .sort((a, b) => {
            const pA = pesoOrdem[statusColaborador(a.nome)] || 9;
            const pB = pesoOrdem[statusColaborador(b.nome)] || 9;
            if (pA !== pB) return pA - pB;
            return a.nome.localeCompare(b.nome);
        });

    tbody.innerHTML = ordenados.map(c => {
        const st = statusColaborador(c.nome);
        const ret = retornoIntervaloColaborador(c.nome);
        const nEsc = c.nome.replace(/'/g, "\\'");
        const btnOpClass = st === 'Presente' ? 'ativo-presente' : (st === 'Ocioso' ? 'ativo-ocioso' : '');
        const btnOpTexto = 'PRESENTE';

        return `
            <tr>
                <td><b>${c.nome}</b> <button class="btn-local-gg" aria-label="Onde está ${escapeHTML(c.nome)}" onmouseenter="mostrarPopupLocal(event, '${nEsc}')" onmouseleave="ocultarPopupRadar()" onclick="mostrarPopupLocal(event, '${nEsc}')">📍</button><br><span class="local-gg-texto">${escapeHTML(textoLocalColaborador(c.nome))}</span></td>
                <td>${c.cargo || c.vinculo || 'REP'}</td>
                <td>${gerarGraficoCircularSVG(c)}</td>
                <td>
                    <b>${st.toUpperCase()}</b>
                    ${st === 'Intervalo' ? `
                        <div style="margin-top:4px; display:flex; align-items:center; gap:4px;">
                            <span style="font-size:10px; color:#38bdf8;">⏳ Retorno:</span>
                            <input type="time" class="form-control" style="padding:2px 5px; font-size:11px; width:90px;" value="${ret}" onchange="alterarHorarioRetornoIntervalo('${nEsc}', this.value)">
                        </div>
                    ` : ''}
                </td>
                <td>
                    <div class="presenca-btn-group">
                        <button class="btn-status-presenca ${btnOpClass}" onclick="alterarStatusPresenca('${nEsc}', 'Presente')">${btnOpTexto}</button>
                        <button class="btn-status-presenca" onclick="alterarStatusPresenca('${nEsc}', 'Escalado')">ESCALADO</button>
                        <button class="btn-status-presenca ${st === 'Ausente' ? 'ativo-ausente' : ''}" onclick="alterarStatusPresenca('${nEsc}', 'Ausente')">FALTA</button>
                        <button class="btn-status-presenca ${st === 'DSR' ? 'ativo-dsr' : ''}" onclick="alterarStatusPresenca('${nEsc}', 'DSR')">DSR</button>
                        <button class="btn-status-presenca ${st === 'Afastado' ? 'ativo-afastado' : ''}" onclick="alterarStatusPresenca('${nEsc}', 'Afastado')">AFASTADO</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function exportarPresencaCSV() {
    salvarEstadoColetivoSQLite().then(() => { const a=document.createElement('a');a.href='/api/exportar_presenca_csv';a.download='presenca.csv';a.click(); });
}

// =========================================================
// 6. DIRECIONAMENTO, TALENTOS E PLS CONTEXTUAL NO CARD
// =========================================================
function toggleAtividadeDirecionamento(nome, ativ) {
    const r=estadoColetivo.repsEstado[nome] ||= {statusPresenca:'Não informado'};
    r.atividadesDirecionadas=(r.atividadesDirecionadas||[]).includes(ativ)?[]:[ativ];
    r.labor=''; sincronizarLaborDirecionada(nome); salvarEstadoColetivoSQLite(); renderizarTabelaDirecionamento();
}

function executarDirecionamentoSugeridoIA() { return false; }

function limparTodoDirecionamento() {
    Object.keys(estadoColetivo.repsEstado).forEach(k => {
        estadoColetivo.repsEstado[k].atividadesDirecionadas = [];
        sincronizarLaborDirecionada(k);
    });
    salvarEstadoColetivoSQLite();
    renderizarTabelaDirecionamento();
}

function renderizarTabelaDirecionamento() {
    const tbody = document.getElementById('tbody-direcionamento-reps');
    if (!tbody) return;
    const termo = (document.getElementById('filtro-dir-nome').value || '').toLowerCase();

    const presentes = bancoDadosReps.filter(c => estaDisponivelParaEscala(c.nome) && c.nome.toLowerCase().includes(termo));

    tbody.innerHTML = presentes.map(c => {
        const st = estadoColetivo.repsEstado[c.nome] || {};
        const atvs = st.atividadesDirecionadas || [];
        const nEsc = c.nome.replace(/'/g, "\\'");

        const b1 = ATIVIDADES_DIRECIONAMENTO.processamento.map(a =>
            `<span class="chip-dir ${atvs.includes(a) ? 'ativo-proc' : ''}" onclick="toggleAtividadeDirecionamento('${nEsc}', '${a}')">${a}</span>`
        ).join('');
        const b2 = ATIVIDADES_DIRECIONAMENTO.auditoria.map(a =>
            `<span class="chip-dir ${atvs.includes(a) ? 'ativo-aud' : ''}" onclick="toggleAtividadeDirecionamento('${nEsc}', '${a}')">${a}</span>`
        ).join('');
        const b3 = ATIVIDADES_DIRECIONAMENTO.expedicao.map(a =>
            `<span class="chip-dir ${atvs.includes(a) ? 'ativo-exp' : ''}" onclick="toggleAtividadeDirecionamento('${nEsc}', '${a}')">${a}</span>`
        ).join('');

        return `
            <tr>
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${gerarGraficoCircularSVG(c)}
                        <div>
                            <b>${c.nome}</b><br>
                            <span style="font-size:10px; color:var(--success);">${st.statusPresenca || 'Presente'}</span>
                        </div>
                    </div>
                </td>
                <td><div class="dir-chips-wrap">${b1}</div></td>
                <td><div class="dir-chips-wrap">${b2}</div></td>
                <td><div class="dir-chips-wrap">${b3}</div></td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="4">Nenhum colaborador presente. Importe colaboradores em ADM > Carregar .CSV & Dados.</td></tr>';
}

function renderizarTabelaTalentos() {
    const tbody = document.getElementById('tbody-talentos-matriz');
    if (!tbody) return;
    const termo = (document.getElementById('filtro-talentos-nome').value || '').toLowerCase();

    tbody.innerHTML = bancoDadosReps
        .filter(c => c.nome.toLowerCase().includes(termo))
        .map(c => `
            <tr>
                <td><b>${c.nome}</b></td>
                <td>${gerarGraficoCircularSVG(c)}</td>
                <td>${c.pls_volumoso}</td>
                <td>${c.unt_volumoso}</td>
                <td>${c.pls_bancada}</td>
                <td>${c.unt_bancada}</td>
                <td>${c.pls_sorting}</td>
                <td>${c.unt_sorting}</td>
                <td>${c.pls_aduana}</td>
                <td>${c.unt_aduana}</td>
                <td>${c.aval_nao_sist}</td>
                <td>${c.aval_5s}</td>
                <td><b style="color:${corPorNotaMatriz(c.aval_volumoso)}">${c.aval_volumoso}</b></td>
                <td><b style="color:${corPorNotaMatriz(c.aval_bancada)}">${c.aval_bancada}</b></td>
                <td><b style="color:${corPorNotaMatriz(c.aval_sorting)}">${c.aval_sorting}</b></td>
                <td><b style="color:${corPorNotaMatriz(c.aval_aduana)}">${c.aval_aduana}</b></td>
                <td><span class="badge-tela-ativa">${c.aval_operador}</span></td>
            </tr>
        `).join('');
}

// =========================================================
// 7. G&G COMPARTILHADO ENTRE LABORS / PISTAS (OCIOSOS & PEDIR APOIO)
// =========================================================
function removerColaboradorDaFerramentaAtual(nome, menu) {
    if (menu === 'lab_esteira' || menu === 'lab_vol_esteira') {
        const objEst = menu === 'lab_esteira' ? estadoColetivo.labEsteira : estadoColetivo.labVolEsteira;
        (objEst.bancadas6 || []).forEach(b => {
            b.inducao = (b.inducao || []).filter(x => x !== nome);
            b.bipador = (b.bipador || []).filter(x => x !== nome);
            b.etiquetador = (b.etiquetador || []).filter(x => x !== nome);
            ['apoio', 'apoioFim', 'gol'].forEach(k => { if (Array.isArray(b[k])) b[k] = b[k].filter(x => x !== nome); });
        });
        (objEst.ilhas || []).forEach(il => {
            il.sorting = (il.sorting || []).filter(x => x !== nome);
            il.pesca = (il.pesca || []).filter(x => x !== nome);
            il.apoio = (il.apoio || []).filter(x => x !== nome);
        });
        objEst.gol = (objEst.gol || []).filter(x => x !== nome);
        Object.values(objEst.golPostos || {}).forEach(a=>{ const i=a.indexOf(nome); if(i>=0)a.splice(i,1); });
    } else if (menu === 'lab_vol_chao') {
        const vc = estadoColetivo.labVolChao;
        vc.bancadas.forEach(b => {
            if (b.onbip === nome) b.onbip = "";
            b.apoios = b.apoios.map(a => a === nome ? "" : a);
        });
        vc.separadoresLM = vc.separadoresLM.map(s => s === nome ? "" : s);
        vc.separadoresXPT = vc.separadoresXPT.map(s => s === nome ? "" : s);
        Object.keys(vc.extras).forEach(k => { vc.extras[k] = vc.extras[k].map(e => e === nome ? "" : e); });
    } else if (menu === 'lab_auditoria') {
        const au = estadoColetivo.labAuditoria;
        au.auditoriaSVC = (au.auditoriaSVC || []).filter(x => x !== nome);
        au.otimizacaoXPT = (au.otimizacaoXPT || []).filter(x => x !== nome);
        au.movimentarSVC = (au.movimentarSVC || []).filter(x => x !== nome);
        au.movimentarXD = (au.movimentarXD || []).filter(x => x !== nome);
    } else if (menu === 'lab_layout') {
        const ly = estadoColetivo.labLayout || (estadoColetivo.labLayout = { titulo: 'Layout', vagas: ['', '', '', '', ''] });
        ly.vagas = ly.vagas.map(v => v === nome ? '' : v);
    } else if (menu === 'exp_xpt' || menu === 'lab_recebimento') {
        (menu === 'exp_xpt' ? estadoColetivo.xptEquipes : (estadoColetivo.recebEquipes || [])).forEach(eq => {
            if (eq.rep2 === nome) eq.rep2 = "";
            eq.reps = eq.reps.map(r => r === nome ? "" : r);
        });
    } else if (menu === 'exp_mapa_svc' || menu === 'exp_mapa_xd') {
        Object.keys(estadoColetivo.vagasPista).forEach(ch => {
            if (ch.startsWith(menu === 'exp_mapa_svc' ? 'SVC_' : 'XD_') && estadoColetivo.vagasPista[ch].rep === nome) estadoColetivo.vagasPista[ch].rep = "";
        });
    }
}

function removerColaboradorDeTodosOsPostos(nome) {
    MENUS_COM_POOL.forEach(m => removerColaboradorDaFerramentaAtual(nome, m));
}

function obterColaboradoresAlocadosNaFerramentaAtual() {
    const alocados = new Set();
    if (submenuAtual === 'lab_esteira' || submenuAtual === 'lab_vol_esteira') {
        const objEst = submenuAtual === 'lab_esteira' ? estadoColetivo.labEsteira : estadoColetivo.labVolEsteira;
        (objEst.bancadas6 || []).forEach(b => {
            [...(b.inducao || []), ...(b.bipador || []), ...(b.etiquetador || []), ...(b.apoio || []), ...(b.apoioFim || []), ...(b.gol || [])].forEach(n => { if (n) alocados.add(n); });
        });
        (objEst.ilhas || []).forEach(il => {
            [...(il.sorting || []), ...(il.pesca || []), ...(il.apoio || [])].forEach(n => { if (n) alocados.add(n); });
        });
        [...(objEst.gol || []),...Object.values(objEst.golPostos||{}).flat()].forEach(n => { if(n) alocados.add(n); });
    } else if (submenuAtual === 'lab_vol_chao') {
        const vc = estadoColetivo.labVolChao;
        vc.bancadas.forEach(b => {
            if (b.onbip) alocados.add(b.onbip);
            b.apoios.forEach(a => { if (a) alocados.add(a); });
        });
        vc.separadoresLM.forEach(s => { if (s) alocados.add(s); });
        vc.separadoresXPT.forEach(s => { if (s) alocados.add(s); });
        Object.values(vc.extras).flat().forEach(e => { if (e) alocados.add(e); });
    } else if (submenuAtual === 'lab_auditoria') {
        const au = estadoColetivo.labAuditoria;
        [...(au.auditoriaSVC || []), ...(au.otimizacaoXPT || []), ...(au.movimentarSVC || []), ...(au.movimentarXD || [])].forEach(n => { if (n) alocados.add(n); });
    } else if (submenuAtual === 'lab_layout') {
        ((estadoColetivo.labLayout || {}).vagas || []).forEach(n => { if (n) alocados.add(n); });
    } else if (submenuAtual === 'exp_xpt' || submenuAtual === 'lab_recebimento') {
        equipesQuadroAtual().forEach(eq => {
            if (eq.rep2) alocados.add(eq.rep2);
            eq.reps.forEach(r => { if (r) alocados.add(r); });
        });
    } else if (submenuAtual === 'exp_mapa_svc' || submenuAtual === 'exp_mapa_xd') {
        Object.values(estadoColetivo.vagasPista).forEach(v => { if (v.rep) alocados.add(v.rep); });
    }
    return alocados;
}

function obterFiltroAtividadesPorMenu(menu) {
    return {lab_esteira:['Esteira'],lab_vol_chao:['Volumoso'],lab_vol_esteira:['Volumoso em Esteira'],lab_auditoria:['Auditoria SCV','Otimização XPT','Movimentação de Gaiolas'],exp_mapa_svc:['Aduanda SVC'],exp_mapa_xd:['Aduanda XD'],exp_xpt:['Carregamento XPT'],lab_layout:['Layout'],lab_recebimento:['Recebimento']}[menu] || [];
}

// Grupos de compartilhamento G&G:
// - Produção: Labor Esteira <-> Labor Volumoso (Chão e Esteira) <-> Auditoria
// - Expedição: Pista SVC <-> Pista XD <-> Carregamento XPT
function obterAtividadesParceirasGG(menu) {
    if (['lab_esteira', 'lab_vol_chao', 'lab_vol_esteira', 'lab_auditoria', 'lab_layout', 'lab_recebimento'].includes(menu)) {
        return ["Esteira", "Volumoso", "Recebimento", "Layout", "Auditoria SCV", "Otimização XPT", "Movimentação de Gaiolas"];
    }
    return ["Aduanda SVC", "Aduanda XD", "Carregamento XPT"];
}

// Release stale ownership only when the explicit direction no longer matches it.
function sincronizarLaborDirecionada(nome) {
    const r=estadoColetivo.repsEstado[nome]; if(!r) return;
    const atvs=(r.atividadesDirecionadas||[]).map(a=>a==='Auditoria SVC'?'Auditoria SCV':a);
    const validos=MENUS_COM_POOL.filter(m=>atvs.some(a=>obterFiltroAtividadesPorMenu(m).includes(a)));
    // Ambiguous legacy multi-sector directions require an explicit new choice.
    const destino=validos.length===1 ? validos[0] : '';
    MENUS_COM_POOL.filter(m=>m!==destino).forEach(m=>removerColaboradorDaFerramentaAtual(nome,m));
    r.labor=destino;
}

function obterPoolEquipaMenuAtual() {
    bancoDadosReps.forEach(c=>sincronizarLaborDirecionada(c.nome));
    return bancoDadosReps.filter(c=>podeOcuparPosto(c) && estaDisponivelParaEscala(c.nome) && estadoColetivo.repsEstado[c.nome]?.labor===submenuAtual);
}

function renderizarPoolIndividualizado() {
    const box = document.getElementById('pool-colaboradores-lista');
    if (!box) return;
    const busca = (document.getElementById('busca-pool-lateral').value || '').toLowerCase();
    const jaAlocados = obterColaboradoresAlocadosNaFerramentaAtual();

    const lista = obterPoolEquipaMenuAtual()
        .filter(c => !MENUS_EXPEDICAO_COM_ROTAS.includes(submenuAtual) || cargoRepExpedicao(c))
        .filter(c => !jaAlocados.has(c.nome) && c.nome.toLowerCase().includes(busca));

    box.innerHTML = lista.map(c => {
        const st = statusOperacionalColaborador(c.nome);
        const ret = retornoIntervaloColaborador(c.nome);
        const emInt = st === 'Intervalo';
        const emOcioso = st === 'Ocioso';
        const nEsc = c.nome.replace(/'/g, "\\'");

        return `
            <div class="rep-card ${emInt ? 'card-em-intervalo' : ''}"
                 draggable="${!emInt}"
                 ondragstart="iniciarDragRep(event, '${nEsc}')">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        ${gerarGraficoCircularSVG(c)}
                        <div>
                            <div style="font-weight:800; font-size:11.5px; color:#fff;">${c.nome}</div>
                            <div style="font-size:9.5px; color:var(--text-muted);">
                                ${badgeCargo(c)}
                                ${emInt ? `<span class="badge-retorno-intervalo">⏳ Ret: ${ret}</span>` : ''}
                                ${emOcioso ? `<span class="badge-ocioso-tag">🟡 OCIOSO</span>` : ''}
                            </div>
                        </div>
                    </div>
                    ${botaoStatusOperacional(c.nome)}
                </div>
            </div>
        `;
    }).join('') || '<p class="sub-hint" style="text-align:center; padding:12px;">Sem colaboradores livres no banco ou solte um card aqui para devolver.</p>';
}

function iniciarDragRep(ev, nome) {
    if (statusOperacionalColaborador(nome) === 'Intervalo') {
        ev.preventDefault();
        return;
    }
    ev.dataTransfer.setData('text/plain', JSON.stringify({ tipo: 'REP', nome }));
}

function dropDevolverRepAoBanco(ev) {
    ev.preventDefault();
    try {
        const d = JSON.parse(ev.dataTransfer.getData('text/plain'));
        if (d.tipo === 'REP' && d.nome) {
            if (!podeAlocarNaLabor(d.nome, submenuAtual)) return;
            if (estadoColetivo.repsEstado[d.nome]) estadoColetivo.repsEstado[d.nome].labor = submenuAtual;
            removerColaboradorDaFerramentaAtual(d.nome, submenuAtual);
            salvarEstadoColetivoSQLite();
            renderizarTelaAtiva();
        }
    } catch (e) {}
}

function abrirModalGenteGestao() {
    const modal = document.getElementById('modal-gente-gestao');
    const gridMinha = document.getElementById('grid-modal-gente-gestao');
    const gridOciosos = document.getElementById('grid-modal-ociosos-parceiros');
    document.getElementById('lbl-modal-gg-setor').innerText = document.getElementById('label-setor-topo').innerText;

    const alocadosGG = obterColaboradoresAlocadosNaFerramentaAtual();
    const buscaGG = (document.getElementById('busca-gg-modal')?.value || '').toLowerCase();
    const minhaListaTotal = bancoDadosReps.filter(c => alocadosGG.has(c.nome) || estadoColetivo.repsEstado[c.nome]?.labor === submenuAtual);
    const minhaLista = minhaListaTotal.filter(c => c.nome.toLowerCase().includes(buscaGG));
    gridMinha.innerHTML = minhaLista.map(c => {
        const st = statusOperacionalColaborador(c.nome);
        const ret = retornoIntervaloColaborador(c.nome);
        const nEsc = c.nome.replace(/'/g, "\\'");
        const btnOpClass = st === 'Operando' ? 'ativo-presente' : (st === 'Ocioso' ? 'ativo-ocioso' : '');
        const btnOpLabel = st === 'Ocioso' ? '🟡 Ocioso (Clique p/ Operando)' : '🟢 Operando (2º Clique = Ocioso)';
        const btn5S = `<button class="btn-status-presenca ${st === '5S' ? 'ativo-5s' : ''}" onclick="alterarStatusOperacional('${nEsc}', '5S'); abrirModalGenteGestao();">🧹 5S</button>`;

        return `
            <div class="colaborador-card ${st === 'Intervalo' ? 'card-em-intervalo' : ''}">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        ${gerarGraficoCircularSVG(c)}
                        <b>${c.nome}</b>
                    </div>
                    <span class="badge-tela-ativa">${st}</span>
                </div>
                ${st === 'Intervalo' ? `<div style="font-size:11px; color:#38bdf8;">⏳ Retorno: <b>${ret || '--:--'}</b></div>` : ''}
                <div style="display:flex; gap:4px; margin-top:4px;">
                    <button class="btn-status-presenca ${btnOpClass}" style="flex:1;" onclick="clicarBotaoOperandoOcioso('${nEsc}'); abrirModalGenteGestao();">${btnOpLabel}</button>
                    ${btn5S}
                    <button class="btn-status-presenca ${st === 'Intervalo' ? 'ativo-intervalo' : ''}" onclick="alterarStatusOperacional('${nEsc}', 'Intervalo'); abrirModalGenteGestao();">⏳ Intervalo</button>
                </div>
            </div>
        `;
    }).join('');

    // Ociosos compartilhados entre as Labors parceiras (Esteira <-> Volumoso | SVC <-> XD <-> XPT)
    const atvsParceiras = obterAtividadesParceirasGG(submenuAtual);
    const ociososParceiros = bancoDadosReps.filter(c => {
        if (statusOperacionalColaborador(c.nome) !== 'Ocioso' || minhaListaTotal.includes(c) || !c.nome.toLowerCase().includes(buscaGG)) return false;
        const atvs = (estadoColetivo.repsEstado[c.nome] || {}).atividadesDirecionadas || [];
        return !!laborAtualColaborador(c.nome) && atvs.some(a => atvsParceiras.includes(a));
    });

    gridOciosos.innerHTML = ociososParceiros.map(c => {
        const nEsc = c.nome.replace(/'/g, "\\'");
        const atvs = ((estadoColetivo.repsEstado[c.nome] || {}).atividadesDirecionadas || []).join(', ') || 'Geral';
        return `
            <div class="colaborador-card" style="border-left-color:var(--warning);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <b>${c.nome}</b>
                    <span class="badge-ocioso-tag">🟡 OCIOSO</span>
                </div>
                <div style="font-size:10px; color:var(--text-muted);">Origem: ${atvs}</div>
                <button class="btn-primary-full" style="margin-top:4px; padding:6px;" onclick="solicitarPuxarColaborador('${nEsc}')" ${pedidoPuxarPendente(c.nome) ? 'disabled' : ''}>${pedidoPuxarPendente(c.nome) ? '⏳ Aguardando aprovação' : '🧲 Solicitar p/ Minha Labor'}</button>
            </div>
        `;
    }).join('') || '<p class="sub-hint">Nenhum colaborador marcado como Ocioso nas áreas parceiras no momento.</p>';

    modal.style.display = 'flex';
}

function fecharModalGenteGestao() {
    document.getElementById('modal-gente-gestao').style.display = 'none';
}



function enviarPedidoApoioGG() {
    const qtd = parseInt(document.getElementById('gg-qtd-apoio').value) || 1;
    const destino = document.getElementById('gg-setor-alvo-apoio').value;
    const origem = document.getElementById('label-setor-topo').innerText;

    if (!estadoColetivo.pedidosApoioGG) estadoColetivo.pedidosApoioGG = [];
    estadoColetivo.pedidosApoioGG.push({
        id: Date.now(),
        origem,
        destino,
        qtd,
        origemMenu: submenuAtual,
        hora: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
    });
    salvarEstadoColetivoSQLite();
    fecharModalGenteGestao();
    renderizarBarraPedidosApoioGG();
}

function renderizarBarraPedidosApoioGG() {
    const barra = document.getElementById('barra-pedidos-apoio-gg');
    if (!barra) return;
    const pedidos = estadoColetivo.pedidosApoioGG || [];
    if (pedidos.length === 0 && !(estadoColetivo.pedidosPuxar || []).length) {
        barra.style.display = 'none';
        return;
    }
    barra.style.display = 'flex';
    barra.innerHTML = pedidos.map((p, idx) => `
        <div class="solicitacao-item">
            <span>🚨 <b>${p.origem}</b> solicita <b>${p.qtd} REP(s)</b> de apoio a <b>${p.destino}</b> (${p.hora})</span>
            <button class="btn-doca-sm" style="background:var(--success); color:#000; border:none; padding:4px 8px;" onclick="abrirAtenderPedidoApoio(${idx})">✅ Atender e escolher</button>
            <button class="btn-doca-sm" style="padding:4px 8px;" onclick="atenderPedidoApoioGG(${idx})">✕ Fechar</button>
        </div>
    `).join('') + htmlPedidosPuxar();
}

function atenderPedidoApoioGG(idx) {
    if (!confirm('Fechar este pedido sem enviar colaboradores?')) return;
    estadoColetivo.pedidosApoioGG.splice(idx, 1);
    salvarEstadoColetivoSQLite();
    renderizarBarraPedidosApoioGG();
}

// =========================================================
// 8. CALCULADORA HC
// =========================================================
function resumirPresencaHC() {
    const contagem = {atual:bancoDadosReps.length, abs:0, afastado:0, dsr:0};
    bancoDadosReps.forEach(c => {
        const status = statusColaborador(c.nome);
        if (status === 'Ausente') contagem.abs++;
        if (status === 'Afastado') contagem.afastado++;
        if (status === 'DSR') contagem.dsr++;
    });
    return contagem;
}
function compararHC(necessario, atual, abs, afastado, dsr) {
    const disponivel = Math.max(0, atual-abs-afastado-dsr);
    return {necessario, atual, abs, afastado, dsr, disponivel,
        excedente:Math.max(0,disponivel-necessario), deficit:Math.max(0,necessario-disponivel),
        inconsistente:abs+afastado+dsr>atual};
}
function lerComparativoHC(necessario) {
    const base = resumirPresencaHC();
    const valor = (campo) => {
        const input = document.getElementById('calc-hc-'+campo);
        return input && input.value !== '' ? Math.max(0,Math.trunc(Number(input.value)||0)) : base[campo];
    };
    return compararHC(necessario,valor('atual'),valor('abs'),valor('afastado'),valor('dsr'));
}

function calcularCalculadoraHC() {
    restaurarCamposCalcHC();
    const num = (id, d) => { const el = document.getElementById(id); const v = parseFloat(el ? el.value : ''); return Number.isFinite(v) && v > 0 ? v : d; };
    const inpVol = document.getElementById('calc-vol');
    if (estadoColetivo.totalPacotesDiaCSV && inpVol && parseInt(inpVol.value) === 9000 && estadoColetivo.totalPacotesDiaCSV !== 9000) {
        inpVol.value = estadoColetivo.totalPacotesDiaCSV;
    }
    const vol = num('calc-vol', 9000);
    const pctVol = num('calc-pct-vol', 10);
    const modoVol = document.getElementById('calc-modo-vol')?.value === 'esteira' ? 'esteira' : 'chao';
    const hrsTot = num('calc-hrs', 4);
    const hrsTrab = parseFloat(document.getElementById('calc-hrs-trab')?.value) || 0;
    const metas = { bancada: num('calc-meta-ban', 1200), sorting: num('calc-meta-sor', 280), pesca: num('calc-meta-pes', 400) };
    const ph = { onbip: num('calc-ph-onbip', 280), otimizacao: num('calc-ph-otim', 150), separacao: num('calc-ph-sep', 50) };
    guardarCamposCalcHC();

    const hrsRest = Math.max(0.5, hrsTot - hrsTrab);
    const volBulky = Math.round(vol * (pctVol / 100));
    const volEsteira = vol - volBulky;
    // v14: o volumoso é o MESMO volume, feito de duas formas — não divide entre chão e esteira.
    const volVolEsteira = volBulky;
    const volVolChao = volBulky;
    const est = calcularHCEsteira(volEsteira, hrsTot, metas);
    const ve = calcularHCEsteira(volVolEsteira, hrsTot, metas);
    const vc = calcularHCVolChao(volVolChao, hrsTot, ph, (estadoColetivo.labVolChao?.bancadas || []).length || 5);

    const hc = lerComparativoHC(est.total + (modoVol === 'esteira' ? ve.total : vc.total));
    const blocoEsteira = (titulo, r) => `<div class="rel-box"><h3>${titulo}</h3><p style="font-size:12px; line-height:1.8;">
        • <b>Cadência:</b> ${r.cadencia}/h<br>• <b>Bancadas (Indução / Bip / Etiq):</b> ${r.bancada} HC<br>• <b>Sorting nas Ilhas:</b> ${r.sorting} HC<br>
        • <b>Pesca nas Ilhas:</b> ${r.pesca} HC<br>• <b>GOL & Apoio:</b> ${r.golApoio} HC<br>• <b>Total:</b> ${r.total} HC</p></div>`;
    document.getElementById('painel-calculadora-hc').innerHTML = `
        <div class="table-scroll"><table class="tabela-perfis"><thead><tr><th>HC necessário</th><th>HC atual (total)</th><th>ABS / faltas</th><th>Afastados</th><th>DSR</th><th>HC disponível</th><th>Excedente</th><th>Déficit</th></tr></thead><tbody><tr><td>${hc.necessario}</td><td>${hc.atual}</td><td>${hc.abs}</td><td>${hc.afastado}</td><td>${hc.dsr}</td><td>${hc.disponivel}</td><td>${hc.excedente}</td><td>${hc.deficit}</td></tr></tbody></table></div>
        ${hc.inconsistente ? '<p style="color:var(--danger)">ABS, afastados e DSR ultrapassam o HC atual. Confira os números.</p>' : ''}
        <div class="kpi-dashboard">
            <div class="kpi-card"><div><div class="kpi-title">Volume Total Dia (CSV)</div><div class="kpi-value">${vol} pcts</div></div></div>
            <div class="kpi-card"><div><div class="kpi-title">HC Esteira</div><div class="kpi-value" style="color:var(--success);">${est.total} HC</div></div></div>
            <div class="kpi-card"><div><div class="kpi-title">HC Volumoso em Esteira</div><div class="kpi-value" style="color:#38bdf8;">${ve.total} HC</div></div></div>
            <div class="kpi-card"><div><div class="kpi-title">HC Volumoso em Chão</div><div class="kpi-value" style="color:#38bdf8;">${vc.total} HC</div></div></div>
        </div>
        <div style="margin-top:12px; display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:12px;">
            ${blocoEsteira('Esteira • ' + volEsteira + ' pcts', est)}
            ${blocoEsteira('Volumoso em Esteira • ' + volVolEsteira + ' pcts (mesma fórmula da Esteira)', ve)}
            <div class="rel-box"><h3>Volumoso em Chão • ${volVolChao} pcts</h3><p style="font-size:12px; line-height:1.8;">
                • <b>Cadência:</b> ${vc.cadencia}/h<br>
                • <b>On bip (bipadores):</b> ${vc.onbip} HC<br>
                • <b>Otimização (apoio aos bipadores):</b> ${vc.otimizacao} HC <small>(~${vc.otimizacaoPorBancada} por bancada)</small><br>
                • <b>Separação LM / XPT:</b> ${vc.separacao} HC<br>
                • <b>Total:</b> ${vc.total} HC<br>
                • <b>Horas restantes de processo:</b> ${hrsRest.toFixed(1)}h</p></div>
        </div>
    `;
}

// =========================================================
// 9. LABOR ESTEIRA & VOLUMOSO EM ESTEIRA (6 BANCADAS EM 3 LINHAS + ILHAS POR LETRA + GOL)
// =========================================================
function obterObjetoEsteiraAtiva() {
    const chave = submenuAtual === 'lab_vol_esteira' ? 'labVolEsteira' : 'labEsteira';
    estadoColetivo[chave] = migrarEsteiraParaFormatoPlanilha(estadoColetivo[chave]);
    garantirPostosGol(estadoColetivo[chave]);
    return estadoColetivo[chave];
}

// Célula de drop genérica (lista de nomes). alvo: 'lado:IDX:CHAVE' ou 'ilha:IDX:CHAVE'
function celulaEsteiraHTML(reps, alvo, tipoPLS, classeExtra) {
    const cards = (reps || []).map((nome, i) => renderizarMiniCardAlocado(nome, tipoPLS, `removerDaEsteira('${alvo}', ${i})`)).join('');
    return `<div class="lab-cel lab-drop ${classeExtra || ''}"
                 ondragover="event.preventDefault(); this.classList.add('drag-over');"
                 ondragleave="this.classList.remove('drag-over');"
                 ondrop="dropNaEsteira(event, '${alvo}')">${cards || '<span class="lab-vazio" aria-label="vaga livre"></span>'}</div>`;
}

function resolverListaEsteira(alvo) {
    const est = obterObjetoEsteiraAtiva();
    const [tipo, idx, chave] = alvo.split(':');
    if (tipo === 'gol') { garantirPostosGol(est); return est.golPostos[chave==='gol'?'movimentadores':chave] || null; }
    const obj = tipo === 'ilha' ? est.ilhas[+idx] : est.bancadas6[+idx];
    if (!obj) return null;
    if (!Array.isArray(obj[chave])) obj[chave] = [];
    return obj[chave];
}

function dropNaEsteira(ev, alvo) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('drag-over');
    try {
        const d = JSON.parse(ev.dataTransfer.getData('text/plain'));
        if (d.tipo === 'REP' && d.nome) {
            if (!podeAlocarNaLabor(d.nome, submenuAtual)) return;
            if (estadoColetivo.repsEstado[d.nome]) estadoColetivo.repsEstado[d.nome].labor = submenuAtual;
            marcarOperandoAoAlocar(d.nome);
            removerColaboradorDaFerramentaAtual(d.nome, submenuAtual);
            const lista = resolverListaEsteira(alvo);
            if (!lista) return;
            lista.push(d.nome);
            salvarEstadoColetivoSQLite();
            renderizarTelaAtiva();
        }
    } catch (e) { console.error('Drop esteira:', e); }
}

function removerDaEsteira(alvo, idxRep) {
    const lista = resolverListaEsteira(alvo);
    if (!lista) return;
    lista.splice(idxRep, 1);
    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}

// Layout idêntico à planilha:
// [Indução | Indução | Bipadores | Etiq LM | Etiq XPT | Bipadores | Indução | Indução]
// [Apoio | Sorting | Pesca | nº | Ilha LM | Ilha XPT | nº | Pesca | Sorting | Apoio]
// [Apoio fim | total | total | GOL LM | GOL XPT | total | total | Apoio fim]
function renderizarTabuleiroEsteiraIlhas(codigoMenu) {
    const ehVol = codigoMenu === 'lab_vol_esteira';
    const tit = document.getElementById('titulo-esteira-ativa');
    if (tit) tit.innerText = ehVol ? 'Labor Volumoso em Esteira' : 'Labor Esteira';
    const container = document.getElementById('container-esteira-ilhas');
    if (!container) return;

    const est = obterObjetoEsteiraAtiva();
    const plsBan = ehVol ? 'volumoso' : 'bancada';
    const plsSor = ehVol ? 'volumoso' : 'sorting';
    const LM = est.bancadas6[0], XPT = est.bancadas6[1];
    const idxLM = [], idxXPT = [];
    est.ilhas.forEach((il, i) => (il.lado === 'XPT' ? idxXPT : idxLM).push(i));
    const linhas = TOTAL_ILHAS_LADO;
    const soma = (ids, k) => ids.reduce((t, i) => t + (est.ilhas[i][k] || []).length, 0);
    const cab = (txt, n, cls) => `<div class="lab-cab ${cls || ''}">${txt}<b>${n}</b></div>`;
    const liderPesca = mapaPescaUnida(est);
    const celPesca = i => {
        const il = est.ilhas[i];
        if (liderPesca[i] !== i) {
            const ld = est.ilhas[liderPesca[i]];
            return `<div class="lab-cel pesca pesca-unida" title="Pesca compartilhada">↕ com ${escapeHTML(ld.letra || 'ilha acima')}</div>`;
        }
        return celulaEsteiraHTML(il.pesca, `ilha:${i}:pesca`, plsSor, (Number(il.pescaGrupo) || 1) > 1 ? 'pesca pesca-lider' : 'pesca');
    };

    // ---- Topo: Indução / Bipadores / Etiquetadores ----
    const topo = `
        ${cab('Indução', LM.inducao.length)}${cab('Bipadores', LM.bipador.length)}
        ${cab('Etiquetadores LM', LM.etiquetador.length, 'lab-span2-off')}${cab('Etiquetadores XPT', XPT.etiquetador.length)}
        ${cab('Bipadores', XPT.bipador.length)}${cab('Indução', XPT.inducao.length)}
        ${celulaEsteiraHTML(LM.inducao, 'lado:0:inducao', plsBan)}
        ${celulaEsteiraHTML(LM.bipador, 'lado:0:bipador', plsBan)}
        ${celulaEsteiraHTML(LM.etiquetador, 'lado:0:etiquetador', plsBan)}
        ${celulaEsteiraHTML(XPT.etiquetador, 'lado:1:etiquetador', plsBan)}
        ${celulaEsteiraHTML(XPT.bipador, 'lado:1:bipador', plsBan)}
        ${celulaEsteiraHTML(XPT.inducao, 'lado:1:inducao', plsBan)}`;

    // ---- Meio: Ilhas (cada letra é uma ilha) ----
    const nomeIlha = (i, n) => {
        const il = est.ilhas[i];
        const letra = escapeHTML(il.letra || '');
        const stCls = (STATUS_OPERACIONAL.find(x => x.id === il.status) || {}).classe || '';
        const sel = letraSelecionadaLabor ? ' lab-ilha-alvo' : '';
        const ilhaCel = `<div class="lab-ilha ${il.lado === 'XPT' ? 'xpt' : ''} ${il.letra ? '' : 'lab-ilha-sem-nome'} ${stCls ? 'ilha-' + stCls : ''}${sel}" data-ilha="${i}" data-pacotes="${pacotesIlhaLabor(il)}"
                ondragover="event.preventDefault(); this.classList.add('drag-over');"
                ondragleave="this.classList.remove('drag-over');"
                ondrop="dropIlhaEsteira(event, ${i})" onclick="clicarIlhaLabor(${i})">
                <div class="lab-ilha-linha">
                    <span class="lab-ilha-alca" draggable="true" ondragstart="iniciarDragIlha(event, ${i})" title="Arraste para mover a ilha">⠿</span>
                    <span class="lab-ilha-letra" title="${escapeHTML(idsDaIlha(il).join(', '))}">${letra || '<span class="chip-vazio">—</span>'}</span>
                    ${il.letra ? `<button class="lab-ilha-x" onclick="event.stopPropagation(); excluirIlhaEsteira(${i})" title="Tirar a letra da ilha">✕</button>` : ''}
                </div>
                <div class="lab-ilha-linha lab-ilha-info">
                    <span class="lab-ilha-pcts">📦 ${pacotesIlhaLabor(il)}</span>
                    ${liderPesca[i] === i && il.letra ? `<select class="lab-pesca-sel" onclick="event.stopPropagation()" onchange="definirPescaGrupo(${i}, this.value)" title="Pesca simples, dupla ou tripla" aria-label="Tipo de pesca da ilha ${il.lado} ${n}">${[1,2,3].map(k => `<option value="${k}" ${(Number(il.pescaGrupo)||1)===k?'selected':''}>${['P1','P2','P3'][k-1]}</option>`).join('')}</select>` : ''}
                </div>
                ${il.letra ? `<div class="lab-ilha-acoes">${botoesStatusOperacional('ilha:' + i, il.status)}</div>` : ''}
                </div>`;
        return il.lado === 'XPT' ? ilhaCel + `<div class="lab-num">${n}</div>` : `<div class="lab-num">${n}</div>` + ilhaCel;
    };
    let meio = '';
    for (let r = 0; r < linhas; r++) {
        const a = idxLM[r], b = idxXPT[r];
        const vazio = '<div class="lab-cel"></div>';
        meio += `
            ${a !== undefined ? celulaEsteiraHTML(est.ilhas[a].sorting, `ilha:${a}:sorting`, plsSor) : vazio}
            ${a !== undefined ? celPesca(a) : vazio}
            ${nomeIlha(a, r + 1)}
            ${nomeIlha(b, r + 1)}
            ${b !== undefined ? celPesca(b) : vazio}
            ${b !== undefined ? celulaEsteiraHTML(est.ilhas[b].sorting, `ilha:${b}:sorting`, plsSor) : vazio}`;
    }

    // Apoio lateral ocupa toda a altura das ilhas
    const apoioLM = celulaEsteiraHTML(LM.apoio, 'lado:0:apoio', plsSor, 'lab-apoio-col');
    const apoioXPT = celulaEsteiraHTML(XPT.apoio, 'lado:1:apoio', plsSor, 'lab-apoio-col');

    container.innerHTML = `
      <div class="lab-com-banco">
      <aside class="banco-letras ${bancoLetrasAberto ? '' : 'fechado'}" ondragover="event.preventDefault(); this.classList.add('drag-over');" ondragleave="this.classList.remove('drag-over');" ondrop="dropLetraNoBanco(event)">
        ${(() => { const u = letrasNaLabor(est); const l = letrasOtimizadas().filter(x => !u.has(x.letra));
          const bt = `<button class="banco-toggle" onclick="alternarBancoLetras()" title="${bancoLetrasAberto ? 'Recolher' : 'Abrir'} menu de ilhas">${bancoLetrasAberto ? '◀' : '▶'} 🏝️ ${l.length}</button>`;
          if (!bancoLetrasAberto) return bt;
          return bt + `<small>Toque numa letra e depois na ilha (ou arraste).</small>` + (l.length ? l.map(x => `<span class="chip-letra ${letraSelecionadaLabor === x.letra ? 'sel' : ''}" draggable="true" onclick="selecionarLetraLabor('${jsArg(x.letra)}')" ondragstart="iniciarDragLetra(event, '${jsArg(x.letra)}')" title="${x.ids.join(', ')}"><b>${escapeHTML(x.letra)}</b><small>📦 ${pacotesLetra(x)}</small></span>`).join('') : '<span class="chip-vazio">' + (letrasOtimizadas().length ? 'Todas as letras já estão na labor.' : 'Monte as letras no menu Otimização de Labor.') + '</span>'); })()}
      </aside>
      <div class="lab-planilha">
        <div class="lab-topo">${topo}</div>

        <div class="lab-meio" style="--linhas:${linhas}">
            <div class="lab-cab amarelo" style="grid-column:1">APOIO<b>${LM.apoio.length}</b></div>
            ${cab('Sorting', soma(idxLM, 'sorting'))}${cab('Pesca', soma(idxLM, 'pesca'))}
            <div class="lab-cab esteira" style="grid-column:4 / span 2">LM</div>
            <div class="lab-cab esteira" style="grid-column:6 / span 2">XPT</div>
            ${cab('Pesca', soma(idxXPT, 'pesca'))}${cab('Sorting', soma(idxXPT, 'sorting'))}
            <div class="lab-cab amarelo">APOIO<b>${XPT.apoio.length}</b></div>
            <div style="grid-column:1; grid-row:2 / span ${linhas}; display:flex;">${apoioLM}</div>
            <div class="lab-meio-ilhas" style="grid-row:2 / span ${linhas}">${meio}</div>
            <div style="grid-column:10; grid-row:2 / span ${linhas}; display:flex;">${apoioXPT}</div>
        </div>

        <div class="lab-rodape v9">
            <div class="lab-cab azul-forte">OPERADOR INDUÇÃO<b>${LM.apoioFim.length}</b></div>
            <div class="lab-total">${soma(idxLM, 'sorting')}</div>
            <div class="lab-total">${soma(idxLM, 'pesca')}</div>
            <div class="lab-cab esteira" style="grid-column:span 4">GOL<b>${Object.values(est.golPostos).flat().length}</b></div>
            <div class="lab-total">${soma(idxXPT, 'pesca')}</div>
            <div class="lab-total">${soma(idxXPT, 'sorting')}</div>
            <div class="lab-cab azul-forte">APOIO<b>${XPT.apoioFim.length}</b></div>
            ${celulaEsteiraHTML(LM.apoioFim, 'lado:0:apoioFim', plsSor)}
            <div></div><div></div>
            <div class="gol-postos" style="grid-column:span 4">${Object.entries(POSTOS_GOL).map(([k,l])=>`<section><div class="lab-cab">${l}<b>${est.golPostos[k].length}</b></div>${celulaEsteiraHTML(est.golPostos[k], 'gol:0:'+k, plsSor, 'gol')}</section>`).join('')}</div>
            <div></div><div></div>
            ${celulaEsteiraHTML(XPT.apoioFim, 'lado:1:apoioFim', plsSor)}
        </div>
      </div>
      </div>`;
}

function editarLetraIlha(idx, val) {
    const est = obterObjetoEsteiraAtiva();
    est.ilhas[idx].letra = String(val || '').trim().toUpperCase();
    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}

// Drag an island onto another slot: the two slots swap (sides keep 20 slots each).
function iniciarDragIlha(ev, idx) {
    ev.stopPropagation();
    ev.dataTransfer.setData('text/plain', JSON.stringify({ tipo: 'ILHA', idx }));
}
function moverIlhaEsteira(origem, destino) {
    const est = obterObjetoEsteiraAtiva();
    if (origem === destino || !est.ilhas[origem] || !est.ilhas[destino]) return false;
    const a = est.ilhas[origem], b = est.ilhas[destino];
    const ladoA = a.lado, ladoB = b.lado;
    est.ilhas[origem] = { ...b, lado: ladoA };
    est.ilhas[destino] = { ...a, lado: ladoB };
    return true;
}
function dropIlhaEsteira(ev, destino) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('drag-over');
    try {
        const d = JSON.parse(ev.dataTransfer.getData('text/plain'));
        if ((d.tipo === 'ILHA' && moverIlhaEsteira(+d.idx, destino)) || (d.tipo === 'LETRA' && colocarLetraNaIlha(d.letra, destino))) {
            salvarEstadoColetivoSQLite();
            renderizarTelaAtiva();
        }
    } catch (e) { console.error('Mover ilha:', e); }
}

function excluirIlhaEsteira(idx) {
    const est = obterObjetoEsteiraAtiva();
    const il = est.ilhas[idx];
    est.ilhas[idx] = { ...novaIlhaVazia(il.lado), sorting: il.sorting, pesca: il.pesca, apoio: il.apoio };
    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}

function dropNaBancadaEsteira(ev, idxBancada, subPosto) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('drag-over');
    try {
        const d = JSON.parse(ev.dataTransfer.getData('text/plain'));
        if (d.tipo === 'REP' && d.nome) {
            if (!podeAlocarNaLabor(d.nome, submenuAtual)) return;
            if (estadoColetivo.repsEstado[d.nome]) estadoColetivo.repsEstado[d.nome].labor = submenuAtual;
            marcarOperandoAoAlocar(d.nome);
            removerColaboradorDaFerramentaAtual(d.nome, submenuAtual);
            const est = obterObjetoEsteiraAtiva();
            est.bancadas6[idxBancada][subPosto].push(d.nome);
            salvarEstadoColetivoSQLite();
            renderizarTelaAtiva();
        }
    } catch (e) {}
}

function removerDaBancadaEsteira(idxBancada, subPosto, idxRep) {
    const est = obterObjetoEsteiraAtiva();
    est.bancadas6[idxBancada][subPosto].splice(idxRep, 1);
    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}

function dropNaIlhaEsteira(ev, idxIlha, func) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('drag-over');
    try {
        const d = JSON.parse(ev.dataTransfer.getData('text/plain'));
        if (d.tipo === 'REP' && d.nome) {
            if (!podeAlocarNaLabor(d.nome, submenuAtual)) return;
            if (estadoColetivo.repsEstado[d.nome]) estadoColetivo.repsEstado[d.nome].labor = submenuAtual;
            marcarOperandoAoAlocar(d.nome);
            removerColaboradorDaFerramentaAtual(d.nome, submenuAtual);
            const est = obterObjetoEsteiraAtiva();
            est.ilhas[idxIlha][func].push(d.nome);
            salvarEstadoColetivoSQLite();
            renderizarTelaAtiva();
        }
    } catch (e) {}
}

function removerDaIlhaEsteira(idxIlha, func, idxRep) {
    const est = obterObjetoEsteiraAtiva();
    est.ilhas[idxIlha][func].splice(idxRep, 1);
    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}

function dropNoGolEsteira(ev) {
    ev.preventDefault();
    try {
        const d = JSON.parse(ev.dataTransfer.getData('text/plain'));
        if (d.tipo === 'REP' && d.nome) {
            if (!podeAlocarNaLabor(d.nome, submenuAtual)) return;
            if (estadoColetivo.repsEstado[d.nome]) estadoColetivo.repsEstado[d.nome].labor = submenuAtual;
            marcarOperandoAoAlocar(d.nome);
            removerColaboradorDaFerramentaAtual(d.nome, submenuAtual);
            const est = obterObjetoEsteiraAtiva();
            if (!est.gol) est.gol = [];
            est.gol.push(d.nome);
            salvarEstadoColetivoSQLite();
            renderizarTelaAtiva();
        }
    } catch (e) {}
}

function removerDoGolEsteira(idxRep) {
    const est = obterObjetoEsteiraAtiva();
    est.gol.splice(idxRep, 1);
    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}

function limparEsteiraAtiva() {
    const est = obterObjetoEsteiraAtiva();
    est.bancadas6.forEach(b => { b.inducao = []; b.bipador = []; b.etiquetador = []; b.apoio = []; b.apoioFim = []; delete b.gol; });
    est.ilhas.forEach(il => { il.sorting = []; il.pesca = []; il.apoio = []; });
    est.gol = []; est.golPostos={pescadores:[],etiquetadores:[],movimentadores:[]};
    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}

function autoEscalarEsteiraAtivaPorPLS() {
    const est = obterObjetoEsteiraAtiva();
    const usados = obterColaboradoresAlocadosNaFerramentaAtual();
    const candidatos = obterPoolEquipaMenuAtual().filter(c => estaDisponivelParaEscala(c.nome) && !usados.has(c.nome));
    const postos = [];
    const vol = submenuAtual === 'lab_vol_esteira';
    const add = (lista, metrica, peso = 0, grupo = '') => postos.push({lista, metrica, peso, grupo});
    est.bancadas6.forEach(b => {
        add(b.bipador, vol ? 'pls_volumoso' : 'pls_bancada', 4);
        add(b.etiquetador, vol ? 'pls_volumoso' : 'pls_bancada', 3);
    });
    // Preserve specialists for systemic roles; induction is a non-systemic role.
    est.bancadas6.forEach(b => add(b.inducao, 'aval_nao_sist', 3.5));
    const lider = mapaPescaUnida(est);
    est.ilhas.map((il, i) => ({ il, i })).filter(x => x.il.letra)
        .sort((a,b) => pacotesIlhaLabor(b.il, vol) - pacotesIlhaLabor(a.il, vol)).forEach(({ il, i }) => {
        add(il.sorting, vol ? 'pls_volumoso' : 'pls_sorting', 2);
        // Shared fishing: only the leader island gets a fishing post (one REP covers the group).
        if (lider[i] === i) add(il.pesca, 'aval_nao_sist', 1, 'pesca');
    });
    if (!Array.isArray(est.gol)) est.gol = [];
    garantirPostosGol(est); Object.values(est.golPostos).forEach(a=>add(a,'aval_nao_sist'));
    est.bancadas6.forEach(b => { add(b.apoio,'aval_nao_sist'); add(b.apoioFim,'aval_nao_sist'); });
    distribuirEscala(candidatos, postos, usados);
    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}

function distribuirEscala(candidatos, postos, usados) {
    const livres = candidatos.slice();
    const podePreencher = posto => posto.grupo !== 'pesca' || posto.lista.length < 1;
    const escolher = posto => {
        if (!podePreencher(posto)) return;
        livres.sort((a,b) => numMatriz(b[posto.metrica])-numMatriz(a[posto.metrica]) || a.nome.localeCompare(b.nome));
        const c = livres.shift();
        if (!c) return;
        posto.lista.push(c.nome); usados.add(c.nome);
        estadoColetivo.repsEstado[c.nome] = {...estadoColetivo.repsEstado[c.nome], labor:submenuAtual, statusOperacional:'Operando'};
    };
    // Systemic roles use PLS first so their strongest operators are not consumed by support.
    postos.filter(p => p.lista.length === 0).sort((a,b) => b.peso-a.peso).forEach(escolher);
    while (livres.length && postos.length) {
        const p = postos.filter(podePreencher).sort((a,b) => a.lista.length-b.lista.length || b.peso-a.peso)[0];
        if (!p) break;
        escolher(p);
    }
}

// =========================================================
// 10. LABOR VOLUMOSO EM CHÃO (MANTIDA INTACTA) & AUDITORIA
// =========================================================
function renderizarLaborVolumosoChao() {
    const container = document.getElementById('container-volumoso-chao');
    if (!container) return;

    if (!estadoColetivo.labVolChao || !estadoColetivo.labVolChao.bancadas) {
        estadoColetivo.labVolChao = criarEstruturaVolumosoChaoPadrao();
    }
    const vc = estadoColetivo.labVolChao;

    const html5Bancadas = vc.bancadas.map((b, idxB) => `
        <div class="vol-bancada-card">
            <div class="head-posto-esteira laranja" style="border-radius:6px; display:flex; justify-content:space-between; align-items:center; gap:6px;">${b.nome} (4 Espaços) ${botoesStatusOperacional('banc:' + idxB, b.status)}</div>
            <div class="doca-alocado" style="border-color:var(--primary); background:rgba(255,230,0,0.08);"
                 ondragover="event.preventDefault();"
                 ondrop="dropNoVolumosoChao(event, 'bancada_onbip', ${idxB}, 0)">
                ${b.onbip
                    ? renderizarMiniCardAlocado(b.onbip, 'volumoso', `removerDoVolumosoChao('bancada_onbip', ${idxB}, 0)`)
                    : '<span style="font-size:10.5px; color:var(--primary); font-weight:800;">🎯 ONbip: Arraste Rep</span>'}
            </div>
            ${b.apoios.map((apNome, idxAp) => `
                <div class="doca-alocado"
                     ondragover="event.preventDefault();"
                     ondrop="dropNoVolumosoChao(event, 'bancada_apoio', ${idxB}, ${idxAp})">
                    ${apNome
                        ? renderizarMiniCardAlocado(apNome, 'volumoso', `removerDoVolumosoChao('bancada_apoio', ${idxB}, ${idxAp})`)
                        : `<span style="font-size:10px; color:var(--text-muted);">🤝 Apoio ${idxAp + 1}: Arraste Rep</span>`}
                </div>
            `).join('')}
        </div>
    `).join('');

    const montarQuadro20 = (titulo, chaveArray, corHeader) => {
        const arr = vc[chaveArray] || Array(20).fill("");
        const preenchidos = arr.filter(x => x !== "").length;
        return `
            <div class="rel-box" style="padding:12px;">
                <div class="head-posto-esteira ${corHeader}" style="border-radius:6px; font-size:12px; padding:7px; display:flex; justify-content:space-between; align-items:center; gap:6px;">
                    ${titulo} (${preenchidos} / 20 Espaços) ${botoesStatusOperacional('sep:' + chaveArray, (vc.statusSeparacao || {})[chaveArray])}
                </div>
                <div class="grid-20-slots">
                    ${arr.map((nome, idxSlot) => `
                        <div class="doca-alocado"
                             ondragover="event.preventDefault();"
                             ondrop="dropNoVolumosoChao(event, '${chaveArray}', ${idxSlot}, 0)">
                            ${nome
                                ? renderizarMiniCardAlocado(nome, 'volumoso', `removerDoVolumosoChao('${chaveArray}', ${idxSlot}, 0)`)
                                : `<span style="font-size:10px; color:var(--text-muted);">#${idxSlot + 1} Livre</span>`}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    };

    const htmlExtras = Object.keys(vc.extras).map(atExtra => {
        const slots = vc.extras[atExtra] || ["", ""];
        return `
            <div class="vol-bancada-card" style="border-top-color:#38bdf8;">
                <div class="head-posto-esteira azul" style="border-radius:6px;">Extra: ${atExtra} (2 Espaços)</div>
                ${slots.map((nome, idxS) => `
                    <div class="doca-alocado"
                         ondragover="event.preventDefault();"
                         ondrop="dropNoVolumosoChao(event, 'extra', '${atExtra}', ${idxS})">
                        ${nome
                            ? renderizarMiniCardAlocado(nome, 'volumoso', `removerDoVolumosoChao('extra', '${atExtra}', ${idxS})`)
                            : `<span style="font-size:10px; color:var(--text-muted);">${atExtra} #${idxS + 1}: Arraste Rep</span>`}
                    </div>
                `).join('')}
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <h4 style="color:var(--primary); margin-bottom:8px; font-size:13px;">Cinco Quadros de Bancada (1 ONbip + 3 Apoios cada)</h4>
        <div class="vol-bancadas-5-grid">${html5Bancadas}</div>

        <h4 style="color:var(--primary); margin-bottom:8px; font-size:13px;">Quadros de Separação (Até 20 Espaços cada)</h4>
        <div class="vol-separadores-2-grid">
            ${montarQuadro20('SEPARADORES LM', 'separadoresLM', 'azul')}
            ${montarQuadro20('SEPARADORES XPT', 'separadoresXPT', 'amarelo')}
        </div>

        <h4 style="color:var(--primary); margin-bottom:8px; font-size:13px;">Quadro de Atividades Extras (5S, Movimentador e Bulky)</h4>
        <div class="vol-bancadas-5-grid">${htmlExtras}</div>
    `;
}

function dropNoVolumosoChao(ev, tipo, idx1, idx2) {
    ev.preventDefault();
    try {
        const d = JSON.parse(ev.dataTransfer.getData('text/plain'));
        if (d.tipo === 'REP' && d.nome) {
            if (!podeAlocarNaLabor(d.nome, submenuAtual)) return;
            if (estadoColetivo.repsEstado[d.nome]) estadoColetivo.repsEstado[d.nome].labor = submenuAtual;
            marcarOperandoAoAlocar(d.nome);
            removerColaboradorDaFerramentaAtual(d.nome, 'lab_vol_chao');
            const vc = estadoColetivo.labVolChao;
            if (tipo === 'bancada_onbip') vc.bancadas[idx1].onbip = d.nome;
            else if (tipo === 'bancada_apoio') vc.bancadas[idx1].apoios[idx2] = d.nome;
            else if (tipo === 'separadoresLM') vc.separadoresLM[idx1] = d.nome;
            else if (tipo === 'separadoresXPT') vc.separadoresXPT[idx1] = d.nome;
            else if (tipo === 'extra') vc.extras[idx1][idx2] = d.nome;

            salvarEstadoColetivoSQLite();
            renderizarTelaAtiva();
        }
    } catch (e) {}
}

function removerDoVolumosoChao(tipo, idx1, idx2) {
    const vc = estadoColetivo.labVolChao;
    if (tipo === 'bancada_onbip') vc.bancadas[idx1].onbip = "";
    else if (tipo === 'bancada_apoio') vc.bancadas[idx1].apoios[idx2] = "";
    else if (tipo === 'separadoresLM') vc.separadoresLM[idx1] = "";
    else if (tipo === 'separadoresXPT') vc.separadoresXPT[idx1] = "";
    else if (tipo === 'extra') vc.extras[idx1][idx2] = "";

    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}

function limparVolumosoChao() {
    estadoColetivo.labVolChao = criarEstruturaVolumosoChaoPadrao();
    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}

function autoEscalarVolumosoChao() {
    const vc = estadoColetivo.labVolChao;
    const usados = obterColaboradoresAlocadosNaFerramentaAtual();
    const cands = obterPoolEquipaMenuAtual().filter(c => estaDisponivelParaEscala(c.nome) && !usados.has(c.nome));
    const slots = [];
    vc.bancadas.forEach(b => {
        slots.push({get:()=>b.onbip,set:n=>b.onbip=n,metrica:'pls_volumoso'});
        b.apoios.forEach((_,i)=>slots.push({get:()=>b.apoios[i],set:n=>b.apoios[i]=n,metrica:'aval_nao_sist'}));
    });
    ['separadoresLM','separadoresXPT'].forEach(k=>vc[k].forEach((_,i)=>slots.push({get:()=>vc[k][i],set:n=>vc[k][i]=n,metrica:'pls_volumoso'})));
    Object.keys(vc.extras).forEach(k=>vc.extras[k].forEach((_,i)=>slots.push({get:()=>vc.extras[k][i],set:n=>vc.extras[k][i]=n,metrica:k==='5S'?'aval_5s':'aval_nao_sist'})));
    slots.filter(p=>!p.get()).forEach(p=>{
        cands.sort((a,b)=>numMatriz(b[p.metrica])-numMatriz(a[p.metrica]));
        const c=cands.shift(); if(!c)return;
        p.set(c.nome);estadoColetivo.repsEstado[c.nome]={...estadoColetivo.repsEstado[c.nome],labor:submenuAtual,statusOperacional:'Operando'};
    });
    salvarEstadoColetivoSQLite();renderizarTelaAtiva();
    if(cands.length) alert(`${cands.length} colaboradores disponíveis; todos os postos do tabuleiro estão ocupados.`);
}

function renderizarLaborAuditoria() {
    const container = document.getElementById('container-labor-auditoria');
    if (!container) return;

    const au = estadoColetivo.labAuditoria;
    if (!au.rotasAuditadasSVC) au.rotasAuditadasSVC = {};
    const opcoesRotas = nome => `<option value="">-- Selecionar rota --</option>` +
      (estadoColetivo.rotasLabor || listaRotasPlana).map(r => {const rota=r.id_otimizado || r.rota; return `<option value="${escapeHTML(rota)}" ${au.rotasAuditadasSVC[nome]===rota?'selected':''}>${escapeHTML(rota)}</option>`;}).join('');
    const montarBloco = (titulo, chaveLista, extraTopoHtml = '') => {
        const reps = au[chaveLista] || [];
        return `
            <div class="xpt-team-card" ondragover="event.preventDefault();" ondrop="dropNaAuditoria(event, '${chaveLista}')">
                <div class="doca-header" style="border-bottom:1px solid var(--border-color); padding-bottom:6px;">
                    <span style="color:var(--primary); font-size:13px;">${titulo}</span>
                    <span class="badge-tela-ativa">${reps.length} HC</span>
                </div>
                ${extraTopoHtml}
                <div style="display:flex; flex-direction:column; gap:6px; min-height:110px;">
                    ${reps.map((nome, i) => renderizarMiniCardAlocado(nome, 'sorting', `removerDaAuditoria('${chaveLista}', ${i})`) + (chaveLista === 'auditoriaSVC' ? `<label>Rota de ${escapeHTML(nome)}<select class="form-control" aria-label="Rota de ${escapeHTML(nome)}" onchange="selecionarRotaAuditoriaSVC('${nome.replace(/'/g, "\\'")}',this.value)">${opcoesRotas(nome)}</select></label>` : '')).join('')
                      || '<div style="font-size:11px; color:var(--text-muted); text-align:center; padding-top:26px;">Arraste colaboradores do Banco Lateral</div>'}
                </div>
            </div>
        `;
    };

    container.innerHTML = `
        <div class="xpt-equipes-grid">
            ${montarBloco('🔍 Auditoria SVC', 'auditoriaSVC')}
            ${montarBloco('⚡ Otimização XPT (Quadro Único)', 'otimizacaoXPT')}
            ${montarBloco('🛒 Movimentação de Gaiolas — SVC', 'movimentarSVC')}
            ${montarBloco('🛒 Movimentação de Gaiolas — XD', 'movimentarXD')}
        </div>
    `;
}

function selecionarRotaAuditoriaSVC(nome, rota) {
    if (!estadoColetivo.labAuditoria.rotasAuditadasSVC) estadoColetivo.labAuditoria.rotasAuditadasSVC = {};
    estadoColetivo.labAuditoria.rotasAuditadasSVC[nome] = rota;
    salvarEstadoColetivoSQLite();
}

function dropNaAuditoria(ev, chaveLista) {
    ev.preventDefault();
    try {
        const d = JSON.parse(ev.dataTransfer.getData('text/plain'));
        if (d.tipo === 'REP' && d.nome) {
            if (!podeAlocarNaLabor(d.nome, submenuAtual)) return;
            estadoColetivo.repsEstado[d.nome] = {...estadoColetivo.repsEstado[d.nome], labor:'lab_auditoria'};
            removerColaboradorDeTodosOsPostos(d.nome);
            if (!estadoColetivo.labAuditoria[chaveLista]) estadoColetivo.labAuditoria[chaveLista] = [];
            estadoColetivo.labAuditoria[chaveLista].push(d.nome);
            salvarEstadoColetivoSQLite();
            renderizarTelaAtiva();
        }
    } catch (e) {}
}

function removerDaAuditoria(chaveLista, idx) {
    estadoColetivo.labAuditoria[chaveLista].splice(idx, 1);
    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}

// =========================================================
// 11. GESTÃO PROBLEM SOLVER (MÚLTIPLOS POSTOS + TAREFAS COM REP APOIO E FOTO TEMPORÁRIA)
// =========================================================
function lerArquivoComoBase64(inputEl, callback) {
    const arquivo = inputEl?.files?.[0];
    if (!arquivo) { callback(null); return; }
    if (!arquivo.type.startsWith('image/')) { alert('Selecione uma imagem.'); return; }
    const reader = new FileReader();
    reader.onerror = () => alert('Não foi possível ler a imagem.');
    reader.onload = e => callback(e.target.result);
    reader.readAsDataURL(arquivo);
}
async function salvarFotoPS(ref, imagem) {
    const r = await fetch('/api/upload_foto_ps', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({referencia_id:ref,imagem_base64:imagem})});
    if (!r.ok) throw new Error('Falha ao anexar imagem');
}
function anexarImagemTarefaPS(id, input) {
    lerArquivoComoBase64(input, async imagem => {
        if (!imagem) return;
        try { await salvarFotoPS(`TAR_${id}`, imagem); const t=estadoColetivo.psTarefas.find(t=>t.id===id); if (!t) return; t.temFoto=true; await salvarEstadoColetivoSQLite(); renderizarPainelIndividualPS(); }
        catch { alert('A imagem não foi salva. Tente novamente.'); }
    });
}
function limparQuadroMensagensPS() {
    if (!confirm('Limpar todas as mensagens de apoio e pedidos ao TL? As tarefas serão mantidas.')) return;
    estadoColetivo.psPedidosTL=[];
    estadoColetivo.psTarefas.forEach(t=>{t.pediuApoio=false;});
    salvarEstadoColetivoSQLite(); renderizarGestaoPS();
}

function visualizarFotoPSModal(refId) {
    fetch('/api/get_fotos_ps?referencia_id=' + encodeURIComponent(refId))
        .then(r => r.json())
        .then(fotos => {
            const box = document.getElementById('container-img-modal-ps');
            if (!fotos || fotos.length === 0) {
                box.innerHTML = '<p class="sub-hint">Nenhuma foto anexada ou foto já eliminada após conclusão.</p>';
            } else {
                box.innerHTML = fotos.map(f => `<img src="${f.base64}" style="max-width:100%; max-height:65vh; border-radius:8px; border:1px solid var(--primary);">`).join('');
            }
            document.getElementById('modal-ver-foto-ps').style.display = 'flex';
        });
}

function renderizarGestaoPS() {
    const tbodyPostos = document.getElementById('tbody-gestao-postos-ps');
    const selectRespTarefa = document.getElementById('ps-nova-tarefa-resp');
    const selectRepApoioTarefa = document.getElementById('ps-nova-tarefa-rep-apoio');
    const tbodyTarefas = document.getElementById('tbody-lista-tarefas-ps');
    const painelAlertas = document.getElementById('painel-alertas-apoio-ps');
    if (!tbodyPostos) return;

    const opsList = bancoDadosReps.filter(ehCargoOpsII);
    const optsRep = `<option value="">-- Sem REP de Apoio --</option>` +
        bancoDadosReps.filter(r => estaDisponivelParaEscala(r.nome)).map(r => `<option value="${r.nome}">${r.nome}</option>`).join('');

    if (selectRespTarefa) {
        selectRespTarefa.innerHTML = opsList.length > 0
            ? opsList.map(ps => `<option value="${ps.usuario_login || ps.nome}">${ps.nome} (${ps.usuario_login ? '@' + ps.usuario_login : 'OPS II'})</option>`).join('')
            : `<option value="">Nenhum OPS II cadastrado</option>`;
    }
    if (selectRepApoioTarefa) {
        selectRepApoioTarefa.innerHTML = optsRep;
    }

    // Painel de Solicitações de Apoio e Pedidos ao TL
    const tarefasComPedidoApoio = (estadoColetivo.psTarefas || []).filter(t => t.pediuApoio);
    const pedidosTL = estadoColetivo.psPedidosTL || [];
    painelAlertas.innerHTML = `<div class="quadro-mensagens">${tarefasComPedidoApoio.map(t => `<article class="solicitacao-item"><span>🚨 <b>${escapeHTML(t.responsavel)}</b>: ${escapeHTML(t.descricao)}</span></article>`).join('')}${pedidosTL.map(p => `<article class="solicitacao-item"><span>👑 <b>${escapeHTML(p.autor)}</b> • ${escapeHTML(p.hora)}<br>${escapeHTML(p.tipo)}: ${escapeHTML(p.descricao)}</span></article>`).join('')}${!tarefasComPedidoApoio.length && !pedidosTL.length ? '<p class="sub-hint">Nenhuma mensagem no quadro.</p>' : ''}</div>`;

    // Tabela de Escala com Múltiplos Postos (Chips clicáveis)
    tbodyPostos.innerHTML = opsList.map(ps => {
        const ch = (ps.usuario_login || ps.nome).toLowerCase();
        const reg = (estadoColetivo.psPostos || {})[ch] || { postos: [], repApoio: '', extra: '' };
        const postosMarcados = Array.isArray(reg.postos) ? reg.postos : (reg.posto ? [reg.posto] : []);
        const chEsc = ch.replace(/'/g, "\\'");

        const chipsPostos = POSTOS_TRABALHO_PS.map(p => `
            <span class="chip-dir ${postosMarcados.includes(p) ? 'ativo-proc' : ''}"
                  onclick="toggleMultiploPostoPS('${chEsc}', '${p}')">${p}</span>
        `).join('');

        return `
            <tr>
                <td><b>${ps.nome}</b><br><span style="font-size:10px; color:var(--primary);">${ps.usuario_login ? '@' + ps.usuario_login : 'OPS II'}</span></td>
                <td><div class="dir-chips-wrap">${chipsPostos}</div></td>
                <td>
                    <select class="form-control" onchange="salvarEscalaPostoPS('${chEsc}', 'repApoio', this.value)">
                        ${optsRep.replace(`value="${reg.repApoio}"`, `value="${reg.repApoio}" selected`)}
                    </select>
                </td>
                <td>
                    <input type="text" class="form-control" value="${reg.extra || ''}" placeholder="Direcionamento extra..." onchange="salvarEscalaPostoPS('${chEsc}', 'extra', this.value)">
                </td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="4">Somente colaboradores com cargo OPS II podem ser escalados na Gestão de PS. Cadastre alguém com cargo OPSII (PS).</td></tr>';

    // Lista de Tarefas PS (com REP Apoio, Foto e Justificativa)
    const tarefas = estadoColetivo.psTarefas || [];
    tbodyTarefas.innerHTML = tarefas.map((t, i) => `
        <tr>
            <td>${t.hora}</td>
            <td>
                <b>${t.descricao}</b>
                ${t.temFoto ? `<br><button class="btn-pls-inline" style="margin-top:4px;" onclick="visualizarFotoPSModal('TAR_${t.id}')">📷 Ver Foto</button>` : ''}
            </td>
            <td><span class="badge-tela-ativa">${t.responsavel}</span></td>
            <td>${t.repApoio || '-'}</td>
            <td>
                <b>${t.status}</b>
                ${t.justificativa ? `<br><span style="font-size:10.5px; color:var(--warning);">Justificativa: ${t.justificativa}</span>` : ''}
            </td>
            <td><button class="btn-doca-sm" style="max-width:65px; color:#fca5a5;" onclick="excluirTarefaPS(${i})">🗑️</button></td>
        </tr>
    `).join('') || '<tr><td colspan="6">Nenhuma tarefa atribuída no momento.</td></tr>';
}

function toggleMultiploPostoPS(chave, posto) {
    if (!estadoColetivo.psPostos) estadoColetivo.psPostos = {};
    if (!estadoColetivo.psPostos[chave]) estadoColetivo.psPostos[chave] = { postos: [], repApoio: '', extra: '' };
    if (!Array.isArray(estadoColetivo.psPostos[chave].postos)) estadoColetivo.psPostos[chave].postos = [];

    const arr = estadoColetivo.psPostos[chave].postos;
    const idx = arr.indexOf(posto);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(posto);

    salvarEstadoColetivoSQLite();
    renderizarGestaoPS();
}

function salvarEscalaPostoPS(chave, campo, valor) {
    if (!estadoColetivo.psPostos) estadoColetivo.psPostos = {};
    if (!estadoColetivo.psPostos[chave]) estadoColetivo.psPostos[chave] = { postos: [], repApoio: '', extra: '' };
    estadoColetivo.psPostos[chave][campo] = valor;
    salvarEstadoColetivoSQLite();
}

function criarTarefaPS() {
    const desc = (document.getElementById('ps-nova-tarefa-desc').value || '').trim();
    const resp = document.getElementById('ps-nova-tarefa-resp').value;
    const repApoio = document.getElementById('ps-nova-tarefa-rep-apoio').value;
    const inpFoto = document.getElementById('ps-nova-tarefa-foto');

    if (!desc) { alert('⚠️ Descreva a tarefa para o PS.'); return; }

    lerArquivoComoBase64(inpFoto, base64Img => {
        const idTar = Date.now();
        if (!estadoColetivo.psTarefas) estadoColetivo.psTarefas = [];
        estadoColetivo.psTarefas.unshift({
            id: idTar,
            hora: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
            descricao: desc,
            responsavel: resp,
            repApoio: repApoio || '',
            status: 'Pendente ⏳',
            justificativa: '',
            pediuApoio: false,
            temFoto: Boolean(base64Img)
        });

        document.getElementById('ps-nova-tarefa-desc').value = '';
        if (inpFoto) inpFoto.value = '';

        if (base64Img) {
            fetch('/api/upload_foto_ps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ referencia_id: `TAR_${idTar}`, imagem_base64: base64Img })
            });
        }

        salvarEstadoColetivoSQLite();
        renderizarGestaoPS();
    });
}

function atenderApoioTarefaPS(idTarefa) {
    const t = (estadoColetivo.psTarefas || []).find(x => x.id === idTarefa);
    if (t) {
        t.pediuApoio = false;
        t.status = 'Apoio Enviado 🤝';
        salvarEstadoColetivoSQLite();
        renderizarGestaoPS();
    }
}

function responderPedidoTL(idx, novoStatus) {
    if (estadoColetivo.psPedidosTL && estadoColetivo.psPedidosTL[idx]) {
        estadoColetivo.psPedidosTL[idx].status = novoStatus;
        salvarEstadoColetivoSQLite();
        renderizarGestaoPS();
    }
}

function excluirTarefaPS(idx) {
    const tar = estadoColetivo.psTarefas[idx];
    if (tar && tar.temFoto) {
        fetch('/api/deletar_fotos_ps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ referencia_id: `TAR_${tar.id}` })
        });
    }
    estadoColetivo.psTarefas.splice(idx, 1);
    salvarEstadoColetivoSQLite();
    renderizarGestaoPS();
}

// =========================================================
// 12. PROBLEM SOLVER INDIVIDUAL (4 ABAS: POSTO, TAREFAS, MURAL DÚVIDAS C/ FOTO, PEDIDOS AO TL)
// =========================================================
function alternarAbaPSIndividual(aba) {
    abaPSIndividualAtual = aba;
    document.getElementById('btn-ps-aba-posto').classList.toggle('ativo', aba === 'posto');
    document.getElementById('btn-ps-aba-tarefas').classList.toggle('ativo', aba === 'tarefas');
    document.getElementById('btn-ps-aba-duvidas').classList.toggle('ativo', aba === 'duvidas');
    document.getElementById('btn-ps-aba-tl').classList.toggle('ativo', aba === 'tl');
    renderizarPainelIndividualPS();
}

function renderizarPainelIndividualPS() {
    const box = document.getElementById('painel-ps-individual-conteudo');
    if (!box || !usuarioLogado) return;

    const uKey = usuarioLogado.usuario.toLowerCase();
    const meuReg = (estadoColetivo.psPostos || {})[uKey] || { postos: [], repApoio: 'Nenhum', extra: '-' };
    const listaPostos = Array.isArray(meuReg.postos) && meuReg.postos.length > 0 ? meuReg.postos.join(' • ') : 'Nenhum posto escalado';

    if (abaPSIndividualAtual === 'posto') {
        box.innerHTML = `
            <div class="rel-box" style="background:rgba(11,15,25,0.8);">
                <div style="font-size:16px; font-weight:900; color:var(--primary);">📍 Meus Postos Escalados: ${listaPostos}</div>
                <div style="margin-top:8px; font-size:13px;">🤝 REP de Apoio Vinculado: <b>${meuReg.repApoio || 'Nenhum'}</b></div>
                <div style="margin-top:4px; font-size:13px;">➕ Direcionamento Extra: <b>${meuReg.extra || '-'}</b></div>
            </div>
        `;
    } else if (abaPSIndividualAtual === 'tarefas') {
        const minhasTarefas = (estadoColetivo.psTarefas || []).filter(t =>
            String(t.responsavel).toLowerCase() === uKey ||
            String(t.responsavel).toLowerCase() === usuarioLogado.nome.toLowerCase() ||
            usuarioLogado.acessos === 'todos'
        );

        box.innerHTML = minhasTarefas.map(t => `
            <div class="rel-box" style="margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div>
                        <div style="font-size:14px; font-weight:800; color:#fff;">📋 ${t.descricao}</div>
                        <div style="font-size:11px; color:var(--text-muted);">
                            Hora: ${t.hora} | REP Apoio: <b>${t.repApoio || 'Nenhum'}</b> | Status: <b style="color:var(--primary);">${t.status}</b>
                        </div>
                        ${t.temFoto ? `<button class="btn-pls-inline" style="margin-top:5px;" onclick="visualizarFotoPSModal('TAR_${t.id}')">📷 Ver Foto da Tarefa</button>` : ''}
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <label class="btn-doca-sm">📎 Anexar imagem<input type="file" accept="image/*" aria-label="Anexar imagem da tarefa ${t.id}" onchange="anexarImagemTarefaPS(${t.id},this)"></label>
                        <button class="btn-doca-sm" style="padding:6px 10px;" onclick="atualizarStatusTarefaPS(${t.id}, 'Em Andamento ⚙️')">⚙️ Em Andamento</button>
                        <button class="btn-doca-sm" style="padding:6px 10px; color:var(--warning);" onclick="solicitarApoioTarefaPS(${t.id})">🚨 Solicitar Apoio</button>
                        <button class="btn-doca-sm" style="padding:6px 10px; color:var(--danger);" onclick="marcarTarefaNaoResolvidaPS(${t.id})">❌ Não Resolvido</button>
                        <button class="btn-doca-sm" style="padding:6px 10px; color:var(--success);" onclick="concluirTarefaPSApagandoFoto(${t.id})">✅ Concluir (Apaga Foto)</button>
                    </div>
                </div>
                <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
                    <input type="text" id="just-tar-${t.id}" class="form-control" style="flex:1;" value="${t.justificativa || ''}" placeholder="Justificativa obrigatória caso incompleta ou Não Resolvido...">
                    <button class="btn-doca-sm" style="max-width:140px; padding:7px;" onclick="salvarJustificativaTarefaPS(${t.id})">💾 Salvar Justificativa</button>
                </div>
            </div>
        `).join('') || '<p class="sub-hint">Nenhuma tarefa atribuída no momento.</p>';

    } else if (abaPSIndividualAtual === 'duvidas') {
        const duvidas = estadoColetivo.psDuvidas || [];
        box.innerHTML = `
            <div class="rel-box" style="margin-bottom:12px; background:rgba(11,15,25,0.7);">
                <div class="form-cadastro-grid">
                    <div class="form-group" style="grid-column: span 2;">
                        <label>Descreva a Dúvida ou Problema</label>
                        <input type="text" id="ps-duvida-texto" class="form-control" placeholder="Descreva o problema para orientação ou para outro PS assumir...">
                    </div>
                    <div class="form-group">
                        <label>Anexar Imagem do Problema (Temporária)</label>
                        <input type="file" id="ps-duvida-foto" accept="image/*" class="form-control">
                    </div>
                    <button class="btn-primary-full" onclick="enviarDuvidaPS()">📢 Publicar no Mural</button>
                </div>
            </div>
            ${duvidas.map((d, i) => `
                <div class="rel-box" style="margin-bottom:10px; padding:12px;">
                    <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); flex-wrap:wrap;">
                        <b>👤 ${d.autor} (${d.hora})</b>
                        <span style="color:var(--success); font-weight:800;">
                            ${d.assumidoPor ? '🙋‍♂️ Assumido por: ' + d.assumidoPor : '⏳ Aguardando'}
                        </span>
                    </div>
                    <div style="margin:6px 0; font-size:13px; font-weight:700;">${escapeHTML(d.texto)}</div>
                    ${d.temFoto ? `<button class="btn-pls-inline" style="margin-bottom:6px;" onclick="visualizarFotoPSModal('DUV_${d.id}')">📷 Ver Imagem do Problema</button>` : ''}

                    <div style="margin:6px 0; padding-left:8px; border-left:2px solid var(--primary);">
                        ${(d.orientacoes || []).map(o => `<div style="font-size:11.5px; margin-bottom:3px;">💡 <b>${o.autor}:</b> ${escapeHTML(o.texto)}</div>`).join('')}
                    </div>

                    <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
                        <input type="text" id="inp-orientar-${i}" class="form-control" style="flex:1; min-width:180px;" placeholder="Escreva aqui para responder / orientar esta dúvida...">
                        <button class="btn-doca-sm" style="max-width:130px; border-color:var(--primary); color:var(--primary);" onclick="orientarDuvidaPS(${i})">💡 Orientar</button>
                        <button class="btn-doca-sm" style="max-width:130px; border-color:var(--success); color:var(--success);" onclick="assumirDuvidaPS(${i})">🙋‍♂️ Assumir</button>
                        <button class="btn-doca-sm" style="max-width:170px; color:#fca5a5;" onclick="retirarDuvidaResolvidaPS(${i})">✅ Retirar Dúvida (Apaga Foto)</button>
                    </div>
                </div>
            `).join('')}
        `;

    } else if (abaPSIndividualAtual === 'tl') {
        const pedidos = estadoColetivo.psPedidosTL || [];
        box.innerHTML = `
            <div class="rel-box" style="margin-bottom:12px; background:rgba(11,15,25,0.7);">
                <div class="form-cadastro-grid">
                    <div class="form-group">
                        <label>Tipo de Pedido ao TL</label>
                        <select id="tl-pedido-tipo" class="form-control">
                            <option value="Lista de Tratativas">Lista de Tratativas</option>
                            <option value="Apoio Operacional / Recursos">Apoio Operacional / Recursos</option>
                            <option value="Validação de Divergência / RTS">Validação de Divergência / RTS</option>
                        </select>
                    </div>
                    <div class="form-group" style="grid-column: span 2;">
                        <label>Mensagem / Lista de Tratativas ao TL</label>
                        <input type="text" id="tl-pedido-desc" class="form-control" placeholder="Informe os IDs, tratativas ou apoio solicitado ao TL...">
                    </div>
                    <button class="btn-primary-full" onclick="criarPedidoAoTL()">👑 Enviar Pedido ao TL</button>
                </div>
            </div>
            <div class="table-scroll">
                <table class="tabela-perfis">
                    <thead>
                        <tr>
                            <th>Hora</th>
                            <th>Solicitante</th>
                            <th>Tipo</th>
                            <th>Descrição / Lista de Tratativas</th>
                            <th>Registro</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pedidos.map(p => `
                            <tr>
                                <td>${p.hora}</td>
                                <td><b>${p.autor}</b></td>
                                <td><span class="badge-tela-ativa">${p.tipo}</span></td>
                                <td>${p.descricao}</td>
                                <td><b>${p.status}</b></td>
                            </tr>
                        `).join('') || '<tr><td colspan="5">Nenhum pedido enviado ao TL ainda.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
    }
}

function salvarJustificativaTarefaPS(idTarefa) {
    const t = (estadoColetivo.psTarefas || []).find(x => x.id === idTarefa);
    const val = (document.getElementById(`just-tar-${idTarefa}`).value || '').trim();
    if (t) {
        t.justificativa = val;
        salvarEstadoColetivoSQLite();
        renderizarPainelIndividualPS();
    }
}

function atualizarStatusTarefaPS(idTarefa, novoStatus) {
    const t = (estadoColetivo.psTarefas || []).find(x => x.id === idTarefa);
    if (t) {
        t.status = novoStatus;
        salvarEstadoColetivoSQLite();
        renderizarPainelIndividualPS();
    }
}

function solicitarApoioTarefaPS(idTarefa) {
    const t = (estadoColetivo.psTarefas || []).find(x => x.id === idTarefa);
    if (t) {
        t.pediuApoio = true;
        t.status = 'Solicitou Apoio 🚨';
        salvarEstadoColetivoSQLite();
        renderizarPainelIndividualPS();
        alert('🚨 Solicitação de apoio enviada para o painel da Gestão PS!');
    }
}

function marcarTarefaNaoResolvidaPS(idTarefa) {
    const t = (estadoColetivo.psTarefas || []).find(x => x.id === idTarefa);
    const just = (document.getElementById(`just-tar-${idTarefa}`).value || '').trim();
    if (!just) {
        alert('⚠️ Escreva uma justificativa na caixa de texto antes de marcar como Não Resolvido.');
        return;
    }
    if (t) {
        t.justificativa = just;
        t.status = 'Não Resolvido ❌';
        salvarEstadoColetivoSQLite();
        renderizarPainelIndividualPS();
    }
}

function concluirTarefaPSApagandoFoto(idTarefa) {
    const t = (estadoColetivo.psTarefas || []).find(x => x.id === idTarefa);
    if (t) {
        t.status = 'Concluída ✅';
        if (t.temFoto) {
            t.temFoto = false;
            fetch('/api/deletar_fotos_ps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ referencia_id: `TAR_${t.id}` })
            });
        }
        salvarEstadoColetivoSQLite();
        renderizarPainelIndividualPS();
    }
}

function enviarDuvidaPS() {
    const txt = document.getElementById('ps-duvida-texto').value.trim();
    if (!txt || !usuarioLogado) return;
    lerArquivoComoBase64(document.getElementById('ps-duvida-foto'), async imagem => {
        const id = Date.now();
        try {
            if (imagem) await salvarFotoPS(`DUV_${id}`, imagem);
            if (!estadoColetivo.psDuvidas) estadoColetivo.psDuvidas=[];
            estadoColetivo.psDuvidas.unshift({id,autor:`${usuarioLogado.nome} ${usuarioLogado.cargo || ''}`,texto:txt,hora:new Date().toLocaleTimeString('pt-BR'),orientacoes:[],assumidoPor:'',temFoto:Boolean(imagem)});
            await salvarEstadoColetivoSQLite(); renderizarPainelIndividualPS();
        } catch { alert('Não foi possível publicar a dúvida. Tente novamente.'); }
    });
}

function orientarDuvidaPS(idx) {
    const inp = document.getElementById(`inp-orientar-${idx}`);
    const resp = (inp ? inp.value : '').trim();
    if (!resp) { alert('⚠️ Digite a resposta/orientação na caixa de texto.'); return; }
    if (!estadoColetivo.psDuvidas[idx].orientacoes) estadoColetivo.psDuvidas[idx].orientacoes = [];
    estadoColetivo.psDuvidas[idx].orientacoes.push({
        autor: `${usuarioLogado.nome} ${usuarioLogado.cargo || 'OPS III'}`,
        texto: resp
    });
    salvarEstadoColetivoSQLite();
    renderizarPainelIndividualPS();
}

function assumirDuvidaPS(idx) {
    estadoColetivo.psDuvidas[idx].assumidoPor = `${usuarioLogado.nome} ${usuarioLogado.cargo || 'OPS III'}`;
    salvarEstadoColetivoSQLite();
    renderizarPainelIndividualPS();
}

function retirarDuvidaResolvidaPS(idx) {
    const duv = estadoColetivo.psDuvidas[idx];
    if (duv && duv.temFoto) {
        fetch('/api/deletar_fotos_ps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ referencia_id: `DUV_${duv.id}` })
        });
    }
    estadoColetivo.psDuvidas.splice(idx, 1);
    salvarEstadoColetivoSQLite();
    renderizarPainelIndividualPS();
}

function criarPedidoAoTL() {
    const tipo = document.getElementById('tl-pedido-tipo').value;
    const desc = (document.getElementById('tl-pedido-desc').value || '').trim();
    if (!desc) { alert('⚠️ Descreva a lista de tratativas ou apoio solicitado ao TL.'); return; }
    if (!estadoColetivo.psPedidosTL) estadoColetivo.psPedidosTL = [];
    estadoColetivo.psPedidosTL.unshift({
        id: Date.now(),
        hora: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
        autor: `${usuarioLogado.nome} ${usuarioLogado.cargo || 'OPS III'}`,
        tipo,
        descricao: desc,
        status: 'Mensagem enviada'
    });
    document.getElementById('tl-pedido-desc').value = '';
    salvarEstadoColetivoSQLite();
    renderizarPainelIndividualPS();
}

// =========================================================
// 13. HORA A HORA (6 HORAS • SEM EXPEDIÇÃO)
// =========================================================
function inicializarTabela6HorasHH() {
    const tbody = document.getElementById('tbody-hh-6horas');
    if (!tbody) return;
    let html = '';
    for (let h = 1; h <= 6; h++) {
        html += `
            <tr>
                <td><b>${h}ª Hora</b></td>
                <td><input type="number" class="form-control" value="0" oninput="salvarInputsTabelaHH()"></td>
                <td><input type="number" class="form-control" value="0" oninput="salvarInputsTabelaHH()"></td>
                <td><input type="number" class="form-control" value="0" oninput="salvarInputsTabelaHH()"></td>
                <td><input type="text" class="form-control" value="98,5%" oninput="salvarInputsTabelaHH()"></td>
                <td><input type="number" class="form-control" value="0" oninput="salvarInputsTabelaHH()"></td>
                <td><input type="number" class="form-control" value="0" oninput="salvarInputsTabelaHH()"></td>
                <td><input type="number" class="form-control" value="0" oninput="salvarInputsTabelaHH()"></td>
                <td><input type="number" class="form-control" value="0" oninput="salvarInputsTabelaHH()"></td>
                <td><input type="number" class="form-control" value="0" oninput="salvarInputsTabelaHH()"></td>
            </tr>
        `;
    }
    tbody.innerHTML = html;
    atualizarCoresHH();
}

function salvarInputsTabelaHH() {
    atualizarCoresHH();
    const trs = document.querySelectorAll('#tbody-hh-6horas tr');
    estadoColetivo.horaHora = {};
    trs.forEach((tr, idx) => {
        estadoColetivo.horaHora[idx + 1] = Array.from(tr.querySelectorAll('input')).map(i => i.value);
    });
    salvarEstadoColetivoSQLite();
}

function restaurarInputsTabelaHH() {
    const trs = document.querySelectorAll('#tbody-hh-6horas tr');
    trs.forEach((tr, idx) => {
        const vals = (estadoColetivo.horaHora || {})[idx + 1];
        if (Array.isArray(vals)) {
            const inps = tr.querySelectorAll('input');
            vals.forEach((v, i) => { if (inps[i]) inps[i].value = v; });
        }
    });
    atualizarCoresHH();
}

// =========================================================
// 14. EXPEDIÇÃO & PISTA: VAGAS CORRIGIDAS (SVC 01-27 | XD 28-58), CARDS DE STATUS COM CANCELAR & XPT
// =========================================================
function renderizarMapaVagasPista(setor) {
    const inicioV = setor === 'SVC' ? 1 : 28;
    const fimV = setor === 'SVC' ? 27 : 58;
    document.getElementById('pista-titulo-setor').innerText = `Labor Pista ${setor} — Vagas ${String(inicioV).padStart(2, '0')} a ${String(fimV).padStart(2, '0')}`;
    const grid = document.getElementById('grid-vagas-pista');
    if (!grid) return;

    let ocupadas = 0;
    let html = '';

    for (let v = inicioV; v <= fimV; v++) {
        const numFmt = String(v).padStart(2, '0');
        const chave = `${setor}_${numFmt}`;
        const dVaga = estadoColetivo.vagasPista[chave] || { rota: '', onda: '', spr: 0, rep: '', inicioTimer: null };
        if (dVaga.rota) ocupadas++;

        html += `
            <div class="doca" ondragover="event.preventDefault(); this.classList.add('drag-over');" ondragleave="this.classList.remove('drag-over');" ondrop="dropNaVagaPista(event, '${chave}')">
                <div class="doca-header">
                    <span style="color:var(--primary);">📍 Vaga ${numFmt}</span>
                    <span class="vaga-timer-badge" id="timer-${chave}" data-inicio="${dVaga.inicioTimer || ''}">00:00</span>
                </div>
                <div class="doca-rota-box">
                    <span>${iconeStatusRota(listaRotasPlana.find(r=>r.rota===dVaga.rota)?.status_gate || 'PENDENTE')} ${dVaga.rota ? 'Rota ' + dVaga.rota : 'Vaga Livre'}</span>
                    <span class="badge-pacotes-vaga">📦 ${dVaga.spr || 0} pcts</span>
                </div>
                <div style="min-height:36px;">
                    ${dVaga.rep
                        ? renderizarMiniCardAlocado(dVaga.rep, 'aduana', `removerRepDaVagaPista('${chave}')`)
                        : `<div class="doca-alocado"><span style="color:var(--text-muted);">👤 REP disponível</span></div>`}
                </div>
                <div class="doca-actions">
                    <button class="btn-doca-sm" onclick="selecionarRepExpedicao('${chave}')" ${usuarioLogado?.cargo === 'ADM' ? '' : 'disabled'}>＋ Alocar REP</button>
                    <button class="btn-doca-sm" onclick="removerRepDaVagaPista('${chave}')" title="Devolver REP ao banco">↩ Banco</button>
                </div>
            </div>
        `;
    }
    grid.innerHTML = html;

    const total = (fimV - inicioV) + 1;
    document.getElementById('expedicao-kpis').innerHTML = `
        <div class="kpi-card"><div><div class="kpi-title">Total de Vagas (${setor})</div><div class="kpi-value">${total}</div></div></div>
        <div class="kpi-card"><div><div class="kpi-title">Vagas com rota</div><div class="kpi-value" style="color:var(--warning);">${ocupadas}</div></div></div>
        <div class="kpi-card"><div><div class="kpi-title">Vagas Livres</div><div class="kpi-value" style="color:var(--success);">${total - ocupadas}</div></div></div>
    `;
    atualizarTodosCronometrosVagas();
}

function dropNaVagaPista(ev, chave) {
    ev.preventDefault();
    if (!admPodeAlocarExpedicao() || !vagaPistaValida(chave, submenuAtual)) return;
    ev.currentTarget.classList.remove('drag-over');
    try {
        const d = JSON.parse(ev.dataTransfer.getData('text/plain'));
        if (!estadoColetivo.vagasPista[chave]) estadoColetivo.vagasPista[chave] = { rota: '', spr: 0, rep: '', inicioTimer: null };
        if (d.tipo === 'REP' && d.nome) {
            if (!repDisponivelExpedicao(d.nome)) return;
            if (estadoColetivo.repsEstado[d.nome]) estadoColetivo.repsEstado[d.nome].labor = submenuAtual;
            marcarOperandoAoAlocar(d.nome);
            removerColaboradorDaFerramentaAtual(d.nome, submenuAtual);
            estadoColetivo.vagasPista[chave].rep = d.nome;
            salvarEstadoColetivoSQLite();
            renderizarTelaAtiva();
        }
    } catch (e) {}
}

function removerRepDaVagaPista(chave) {
    if (!admPodeAlocarExpedicao() || !vagaPistaValida(chave, submenuAtual)) return;
    if (estadoColetivo.vagasPista[chave]) {
        estadoColetivo.vagasPista[chave].rep = "";
        salvarEstadoColetivoSQLite();
        renderizarTelaAtiva();
    }
}

function sugerirRepVagaPorPLS(chave) {
    const jaAlocados = obterColaboradoresAlocadosNaFerramentaAtual();
    const cands = obterPoolEquipaMenuAtual()
        .filter(c => statusColaborador(c.nome) === 'Presente' && !jaAlocados.has(c.nome))
        .sort((a, b) => numMatriz(b.pls_aduana) - numMatriz(a.pls_aduana));
    if (cands.length === 0) return;
    if (!estadoColetivo.vagasPista[chave]) estadoColetivo.vagasPista[chave] = { rota: '', spr: 0, rep: cands[0].nome, inicioTimer: null };
    else estadoColetivo.vagasPista[chave].rep = cands[0].nome;
    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}

function autoEscalarTodasVagasPorPLS() {
    const setor = submenuAtual === 'exp_mapa_svc' ? 'SVC' : 'XD';
    const cands = obterPoolEquipaMenuAtual()
        .filter(c => statusColaborador(c.nome) === 'Presente')
        .sort((a, b) => numMatriz(b.pls_aduana) - numMatriz(a.pls_aduana));
    let ptr = 0;
    Object.keys(estadoColetivo.vagasPista).forEach(ch => {
        if (ch.startsWith(setor) && estadoColetivo.vagasPista[ch].rota && cands[ptr]) {
            estadoColetivo.vagasPista[ch].rep = cands[ptr].nome;
            ptr++;
        }
    });
    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}

function limparVagaPista(chave) {
    delete estadoColetivo.vagasPista[chave];
    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}

// Cards de Status de Rotas na barra lateral (Expedida / Em Vaga / Pendente) + Função de Cancelar Entrada ou Saída
function renderizarStatusRotasSidebar() {
    const box = document.getElementById('pool-rotas-lista');
    if (!box) return;

    box.innerHTML = listaRotasPlana.map(r => {
        const st = r.status_gate || 'PENDENTE';
        const corBorda = st === 'EXPEDIDA' ? 'var(--success)' : (st === 'EM_VAGA' ? 'var(--warning)' : 'var(--border-color)');
        const badgeStatus = `${iconeStatusRota(st)} ${st === 'EXPEDIDA' ? 'EXPEDIDA' : st === 'EM_VAGA' ? 'EM VAGA ('+(r.vaga || '-')+')' : 'PENDENTE'}`;

        return `
            <div class="rota-card" style="border-left-color:${corBorda}; cursor:default;">
                <div style="display:flex; justify-content:space-between; font-weight:800;">
                    <span style="color:var(--primary);">🚚 Rota ${r.rota}</span>
                    <span class="badge-tela-ativa" style="font-size:9.5px;">${badgeStatus}</span>
                </div>
                <div style="font-size:10.5px; color:var(--text-muted); margin-top:3px;">
                    Onda: <b>${r.onda || 'Onda 1'}</b> | 📦 ${r.spr || 0} pcts
                </div>
                ${st !== 'PENDENTE' && st !== 'AGUARDANDO' ? `
                    <button class="btn-doca-sm" style="margin-top:6px; width:100%; border-color:var(--danger); color:#fca5a5;" onclick="cancelarAcaoGateErro(${r.id}, '${r.rota}')">
                        ↩️ Cancelar Entrada / Saída (Corrigir Gate)
                    </button>
                ` : ''}
            </div>
        `;
    }).join('') || '<p class="sub-hint">Nenhuma rota carregada.</p>';
}

function cancelarAcaoGateErro(idRota, codigoRota) {
    if (!confirm(`Deseja cancelar a Entrada/Saída da Rota ${codigoRota} e devolvê-la para Pendente?`)) return;
    Object.keys(estadoColetivo.vagasPista).forEach(ch => {
        if (estadoColetivo.vagasPista[ch].rota === codigoRota) {
            delete estadoColetivo.vagasPista[ch];
        }
    });
    salvarEstadoColetivoSQLite();

    fetch('/api/gate_acao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: idRota, acao: 'CANCELAR' })
    }).then(() => sincronizarDadosCompletos());
}

// Carregamento XPT
function renderizarQuadrosXPT() {
    const container = document.getElementById(submenuAtual === 'lab_recebimento' ? 'container-quadros-receb' : 'container-6-quadros-xpt');
    if (!container) return;

    container.innerHTML = equipesQuadroAtual().map((eq, idxEq) => {
        const slotsReps = eq.reps.map((nomeRep, idxSlot) => `
            <div class="doca-alocado" ondragover="event.preventDefault();" ondrop="dropRepXPT(event, ${idxEq}, ${idxSlot})">
                ${nomeRep
                    ? renderizarMiniCardAlocado(nomeRep, submenuAtual === 'lab_recebimento' ? 'volumoso' : 'aduana', `limparSlotXPT(${idxEq}, ${idxSlot})`)
                    : `<span style="color:var(--text-muted);">👤 REP ${idxSlot + 1}: Arraste do Banco</span>`}
            </div>
        `).join('');

        return `
            <div class="xpt-team-card">
                <input type="text" class="xpt-legenda-input" value="${eq.legenda}" onchange="atualizarLegendaXPT(${idxEq}, this.value)">
                <div class="doca-alocado" style="border-color:var(--primary); background:rgba(255,230,0,0.08);" ondragover="event.preventDefault();" ondrop="dropRepXPT(event, ${idxEq}, 'rep2')">
                    ${eq.rep2
                        ? renderizarMiniCardAlocado(eq.rep2, 'aduana', `limparSlotXPT(${idxEq}, 'rep2')`)
                        : `<span style="color:var(--primary); font-weight:800;">⭐ REP2 (Líder): Arraste REP2</span>`}
                </div>
                ${slotsReps}
            </div>
        `;
    }).join('');
}

function atualizarLegendaXPT(idx, val) {
    equipesQuadroAtual()[idx].legenda = val;
    salvarEstadoColetivoSQLite();
}

function dropRepXPT(ev, idxEq, slot) {
    ev.preventDefault();
    try {
        const d = JSON.parse(ev.dataTransfer.getData('text/plain'));
        if (d.tipo === 'REP' && d.nome) {
            if (!podeAlocarNaLabor(d.nome, submenuAtual)) return;
            if (estadoColetivo.repsEstado[d.nome]) estadoColetivo.repsEstado[d.nome].labor = submenuAtual;
            marcarOperandoAoAlocar(d.nome);
            removerColaboradorDaFerramentaAtual(d.nome, submenuAtual);
            if (slot === 'rep2') equipesQuadroAtual()[idxEq].rep2 = d.nome;
            else equipesQuadroAtual()[idxEq].reps[slot] = d.nome;
            salvarEstadoColetivoSQLite();
            renderizarTelaAtiva();
        }
    } catch (e) {}
}

function limparSlotXPT(idxEq, slot) {
    if (slot === 'rep2') equipesQuadroAtual()[idxEq].rep2 = '';
    else equipesQuadroAtual()[idxEq].reps[slot] = '';
    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}

function autoEscalarXPTPorNaoSistemica() {
    const cands = obterPoolEquipaMenuAtual()
        .filter(c => statusColaborador(c.nome) === 'Presente')
        .sort((a, b) => numMatriz(b.aval_nao_sist) - numMatriz(a.aval_nao_sist));
    let ptr = 0;

    equipesQuadroAtual().forEach(eq => {
        if (cands[ptr]) { eq.rep2 = cands[ptr].nome; ptr++; }
        for (let i = 0; i < 5; i++) {
            if (cands[ptr]) { eq.reps[i] = cands[ptr].nome; ptr++; }
        }
    });
    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}

// =========================================================
// 15. CONTROLE GATE UNIFICADO (ONDA NO LUGAR DE SHIPPING ID + VERIFICAR ENTRADAS + VAGAS 01-27 / 28-58)
// =========================================================
function mudarAbaGate(aba) {
    abaGateAtual = aba;
    document.getElementById('btn-gate-entrada').classList.toggle('ativo', aba === 'entrada');
    document.getElementById('btn-gate-saida').classList.toggle('ativo', aba === 'saida');
    document.getElementById('btn-gate-verificar').classList.toggle('ativo', aba === 'verificar');
    renderizarControleGateMobile();
}

function mudarLadoGate(lado) {
    ladoGateAtual = lado;
    document.getElementById('btn-lado-svc').classList.toggle('ativo-svc', lado === 'svc');
    document.getElementById('btn-lado-xd').classList.toggle('ativo-xd', lado === 'xd');
    renderizarControleGateMobile();
}

function renderizarControleGateMobile() {
    const container = document.getElementById('container-gate-conteudo');
    if (!container) return;

    const setorUpper = ladoGateAtual.toUpperCase();
    // Vagas corrigidas: SVC 01 a 27 | XD 28 a 58
    const inicioV = ladoGateAtual === 'svc' ? 1 : 28;
    const fimV = ladoGateAtual === 'svc' ? 27 : 58;

    const ocupadasMap = {};
    Object.keys(estadoColetivo.vagasPista).forEach(k => {
        if (k.startsWith(setorUpper) && estadoColetivo.vagasPista[k].rota) {
            ocupadasMap[k.split('_')[1]] = estadoColetivo.vagasPista[k].rota;
        }
    });
    listaRotasPlana.forEach(r => {
        if (r.status_gate === 'EM_VAGA' && r.vaga) {
            const vNum = parseInt(String(r.vaga).replace(/\D/g, '')) || 1;
            if ((ladoGateAtual === 'svc' && vNum <= 27) || (ladoGateAtual === 'xd' && vNum >= 28)) {
                ocupadasMap[String(vNum).padStart(2, '0')] = r.rota;
            }
        }
    });

    let pillsVagas = '';
    const vagasLivres = [];
    for (let v = inicioV; v <= fimV; v++) {
        const vFmt = String(v).padStart(2, '0');
        const rOcup = ocupadasMap[vFmt];
        if (!rOcup) vagasLivres.push(vFmt);
        pillsVagas += `
            <span class="pill-vaga-status ${rOcup ? 'pill-vaga-ocupada' : 'pill-vaga-livre'}">
                Vaga ${vFmt}: ${rOcup ? '🔴 Rota ' + rOcup : '🟢 Livre'}
            </span>
        `;
    }

    // Aba 3: VERIFICAR ENTRADAS (Mostra quais rotas já deram entrada e quais ainda faltam)
    if (abaGateAtual === 'verificar') {
        const faltamDarEntrada = listaRotasPlana.filter(r => (r.status_gate || 'PENDENTE') === 'PENDENTE' || r.status_gate === 'AGUARDANDO');
        const jaDeramEntrada = listaRotasPlana.filter(r => r.status_gate === 'EM_VAGA' || r.status_gate === 'EXPEDIDA');

        container.innerHTML = `
            <div class="rel-box" style="margin-bottom:12px;">
                <h3 style="color:var(--warning);">⏳ Rotas que Ainda Faltam Dar Entrada (${faltamDarEntrada.length})</h3>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    ${faltamDarEntrada.map(r => `
                        <div class="doca-rota-box">
                            <span>🚚 Rota <b>${r.rota}</b> • Onda: <b>${r.onda || 'Onda 1'}</b></span>
                            <span class="badge-pacotes-vaga">📦 ${r.spr || 0} pcts</span>
                        </div>
                    `).join('') || '<p class="sub-hint">Todas as rotas já deram entrada!</p>'}
                </div>
            </div>
            <div class="rel-box">
                <h3 style="color:var(--success);">✅ Rotas que Já Deram Entrada (${jaDeramEntrada.length})</h3>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    ${jaDeramEntrada.map(r => `
                        <div class="doca-rota-box" style="border-left:3px solid var(--success);">
                            <div>
                                <span>🚚 Rota <b>${r.rota}</b> (Vaga ${r.vaga || '-'})</span><br>
                                <small style="color:var(--text-muted);">Onda: ${r.onda || 'Onda 1'} • Entrada: ${r.hora_entrada || '-'} • Status: ${r.status_gate}</small>
                            </div>
                            <button class="btn-doca-sm" style="max-width:110px; border-color:var(--danger); color:#fca5a5;" onclick="cancelarAcaoGateErro(${r.id}, '${r.rota}')">↩️ Cancelar</button>
                        </div>
                    `).join('') || '<p class="sub-hint">Nenhuma rota deu entrada ainda.</p>'}
                </div>
            </div>
        `;
        return;
    }

    const rotasFiltradas = listaRotasPlana.filter(r => {
        if (abaGateAtual === 'entrada') {
            return (r.status_gate || 'PENDENTE') === 'PENDENTE' || r.status_gate === 'AGUARDANDO';
        } else {
            return r.status_gate === 'EM_VAGA';
        }
    });

    const cardsHtml = rotasFiltradas.map(r => {
        const vagaDefault = vagasLivres[0] || String(inicioV).padStart(2, '0');
        const vagaEscaladaFmt = r.vaga ? String(r.vaga).replace(/\D/g, '').padStart(2, '0') : vagaDefault;
        const opcoesSelect = [...new Set([vagaEscaladaFmt, ...vagasLivres])].sort();

        if (abaGateAtual === 'entrada') {
            return `
                <div class="gate-rota-card">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:17px; font-weight:900; color:var(--primary);">🚚 Rota ${r.rota}</span>
                        <span class="badge-pacotes-vaga">📦 ${r.spr || 0} pcts</span>
                    </div>
                    <div style="font-size:12px; color:var(--text-muted);">
                        🌊 Onda: <b style="color:#fff;">${r.onda || 'Onda 1'}</b> | Modal: <b>${r.veiculo || 'Utilitário'}</b> | Serviço: <b>${r.tipo_servico || r.lado || 'LM'}</b>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <label style="font-size:11px; font-weight:800;">📍 Vaga (${setorUpper}):</label>
                        <select id="sel-vaga-gate-${r.id}" class="form-control" style="flex:1; font-weight:800;">
                            ${opcoesSelect.map(vNum => `<option value="${vNum}" ${vNum === vagaEscaladaFmt ? 'selected' : ''}>Vaga ${vNum} ${ocupadasMap[vNum] && vNum !== vagaEscaladaFmt ? '(Ocupada)' : '(Livre)'}</option>`).join('')}
                        </select>
                    </div>
                    <button class="btn-primary-full" style="padding:12px; font-size:13px;" onclick="executarAcaoGate(${r.id}, 'ENTRADA', '${r.rota}', ${r.spr || 0}, '${r.onda || 'Onda 1'}')">
                        🟢 CONFIRMAR ENTRADA NA VAGA & INICIAR TIMER
                    </button>
                </div>
            `;
        } else {
            return `
                <div class="gate-rota-card" style="border-left-color:var(--success);">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:17px; font-weight:900; color:#fff;">🚚 Rota ${r.rota}</span>
                        <span class="badge-tela-ativa">📍 Vaga ${vagaEscaladaFmt}</span>
                    </div>
                    <div style="font-size:12px; color:var(--text-muted);">
                        🌊 Onda: <b>${r.onda || 'Onda 1'}</b> | Entrada às: <b>${r.hora_entrada || '-'}</b> | Pacotes: <b>${r.spr || 0}</b>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="btn-primary-full" style="background:var(--success); color:#000; padding:12px; font-size:13px; flex:2;" onclick="executarAcaoGate(${r.id}, 'SAIDA', '${r.rota}', ${r.spr || 0}, '${r.onda || ''}', '${vagaEscaladaFmt}')">
                            🚀 CONFIRMAR SAÍDA & ENCERRAR TIMER
                        </button>
                        <button class="btn-doca-sm" style="flex:1; border-color:var(--danger); color:#fca5a5;" onclick="cancelarAcaoGateErro(${r.id}, '${r.rota}')">
                            ↩️ Cancelar
                        </button>
                    </div>
                </div>
            `;
        }
    }).join('');

    container.innerHTML = `
        <div class="rel-box" style="padding:12px; margin-bottom:12px;">
            <div style="font-size:11px; font-weight:800; color:var(--text-muted); margin-bottom:6px;">
                VAGAS LIVRES E OCUPADAS (${setorUpper} • VAGAS ${String(inicioV).padStart(2,'0')} A ${String(fimV).padStart(2,'0')}):
            </div>
            <div class="vagas-status-carousel">${pillsVagas}</div>
        </div>
        ${cardsHtml || `<div class="rel-box" style="text-align:center; padding:22px; color:var(--text-muted);">Nenhuma rota pendente nesta aba (${setorUpper}).</div>`}
    `;
}

function executarAcaoGate(idRota, acao, codigoRota, spr, onda, vagaSaida = '') {
    const sel = document.getElementById(`sel-vaga-gate-${idRota}`);
    const vagaEscolhida = sel ? sel.value : vagaSaida;
    const vNum = parseInt(vagaEscolhida) || 1;
    const setor = vNum >= 28 ? 'XD' : 'SVC';
    const chaveVaga = `${setor}_${String(vNum).padStart(2, '0')}`;

    if (acao === 'ENTRADA') {
        estadoColetivo.vagasPista[chaveVaga] = {
            rota: codigoRota,
            onda: onda || 'Onda 1',
            spr: spr || 0,
            rep: (estadoColetivo.vagasPista[chaveVaga] || {}).rep || '',
            inicioTimer: Date.now()
        };
        salvarEstadoColetivoSQLite();
    } else if (acao === 'SAIDA') {
        delete estadoColetivo.vagasPista[chaveVaga];
        salvarEstadoColetivoSQLite();
    }

    fetch('/api/gate_acao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: idRota, acao, vaga: vagaEscolhida })
    }).then(() => sincronizarDadosCompletos());
}

// =========================================================
// 16. ADM: CARREGAMENTO DE .CSV (COLABORADORES, MATRIZ E CRIAÇÃO DE ILHAS/PACOTES)
// =========================================================
async function enviarArquivoCSVBruto(tipo) {
    const mapa = {colaboradores:'file-csv-bruto-colabs',matriz:'file-csv-bruto-matriz',rotas:'file-csv-bruto-rotas',expedicao:'file-csv-bruto-expedicao'};
    const inp=document.getElementById(mapa[tipo]);
    if (!inp?.files?.length) {alert('Selecione o arquivo CSV.');return;}
    const form=new FormData();form.append('tipo',tipo);form.append('arquivo',inp.files[0]);
    try {
        importacaoPendente=true;
        await filaSalvamento;
        const r=await fetch('/api/upload_csv_bruto',{method:'POST',body:form});
        const d=await r.json();if (!r.ok || !d.sucesso) throw new Error(d.msg || 'Importação recusada');
        inp.value='';
        await sincronizarDadosCompletos();
        if(tipo==='rotas') document.getElementById('calc-vol').value=estadoColetivo.totalPacotesDiaCSV;
        if(tipo==='matriz') {ocultarPopupRadar(); renderizarTabelaTalentos();}
        alert(`${d.total} registros importados.`);
    } catch(e) {alert(e.message || 'Falha ao importar o arquivo.');}
    finally {importacaoPendente=false;}
}

function popularCheckboxesPermissoesADM() {
    const grid = document.getElementById('grid-checkboxes-permissoes');
    if (!grid) return;
    grid.innerHTML = CATALOGO_FERRAMENTAS.map(f => `
        <label class="perm-item">
            <input type="checkbox" class="chk-acesso-item" value="${f.id}" checked>
            <span>${f.nome}</span>
        </label>
    `).join('');
}

function marcarTodosAcessosADM(flag) {
    document.querySelectorAll('.chk-acesso-item').forEach(c => c.checked = flag);
}

function salvarUsuarioADM() {
    const usuario = (document.getElementById('adm-user-login').value || '').trim().toLowerCase().replace('@', '');
    const nome = (document.getElementById('adm-user-nome').value || '').trim().toUpperCase();
    const cargo = document.getElementById('adm-user-cargo').value;
    const senha = (document.getElementById('adm-user-senha').value || '').trim();

    if (!usuario || !nome || (!senha && !bancoUsuarios.some(u=>u.usuario===usuario))) {
        alert('⚠️ Preencha @Usuário, Nome e Senha (PIN).');
        return;
    }

    const checks = Array.from(document.querySelectorAll('.chk-acesso-item'));
    const marcados = checks.filter(c => c.checked).map(c => c.value);
    if (marcados.length === 0) {
        alert('⚠️ Selecione pelo menos 1 nível de acesso.');
        return;
    }

    const acessos = marcados.length === checks.length ? 'todos' : marcados.join(',');

    fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, nome, cargo, senha, acessos })
    })
    .then(r => r.json())
    .then(d => {
        if (d.sucesso) {
            document.getElementById('adm-user-login').value = '';
            document.getElementById('adm-user-nome').value = '';
            document.getElementById('adm-user-senha').value = '';
            sincronizarDadosCompletos();
            alert('✅ Utilizador guardado com sucesso!');
        }
    });
}

function editarUsuarioADM(login) {
    const u = bancoUsuarios.find(x => x.usuario.toLowerCase() === login.toLowerCase());
    if (!u) return;
    document.getElementById('adm-user-login').value = u.usuario;
    document.getElementById('adm-user-nome').value = u.nome;
    document.getElementById('adm-user-cargo').value = u.cargo || 'OPS III';
    document.getElementById('adm-user-senha').value = '';

    const ac = String(u.acessos || '').toLowerCase();
    const todos = ac === 'todos';
    const lista = ac.split(',').map(s => s.trim());

    document.querySelectorAll('.chk-acesso-item').forEach(chk => {
        chk.checked = todos || lista.includes(chk.value.toLowerCase());
    });
}

function excluirUsuarioADM(login) {
    if (login.toLowerCase() === 'brunreis') {
        alert('🔒 O utilizador administrador brunreis não pode ser removido.');
        return;
    }
    if (!confirm(`Deseja excluir o utilizador @${login}?`)) return;
    fetch('/api/usuarios?usuario=' + encodeURIComponent(login), { method: 'DELETE' })
        .then(() => sincronizarDadosCompletos());
}

function renderizarUsuariosADM() {
    const tbody = document.getElementById('tbody-usuarios-adm');
    if (!tbody) return;
    tbody.innerHTML = bancoUsuarios.map(u => `
        <tr>
            <td><b>@${u.usuario}</b></td>
            <td><b style="color:var(--primary);">${u.nome} ${u.cargo || 'OPS III'}</b></td>
            <td>Protegido</td>
            <td><span style="font-size:11px;">${u.acessos === 'todos' ? 'Acesso Total (Todos)' : u.acessos}</span></td>
            <td>
                <button class="btn-doca-sm" style="max-width:75px;" onclick="editarUsuarioADM('${u.usuario}')">✏️ Editar</button>
                ${u.usuario.toLowerCase() !== 'brunreis' ? `<button class="btn-doca-sm" style="max-width:75px; color:#fca5a5;" onclick="excluirUsuarioADM('${u.usuario}')">🗑️ Excluir</button>` : ''}
            </td>
        </tr>
    `).join('');
}

// Chat com Privacidade Real (USER:login)
function toggleChatWindow() {
    const w = document.getElementById('chat-window');
    w.style.display = w.style.display === 'none' ? 'flex' : 'none';
}

function popularSelectDestinatariosChat() {
    const sel = document.getElementById('chat-destinatario');
    if (!sel) return;
    const atual = sel.value;
    sel.innerHTML = `<option value="GERAL">🌍 Todos na Operação (Público)</option>` +
        bancoUsuarios
            .filter(u => !usuarioLogado || u.usuario.toLowerCase() !== usuarioLogado.usuario.toLowerCase())
            .map(u => `<option value="USER:${u.usuario.toLowerCase()}">🔒 Privado: ${u.nome} ${u.cargo || 'OPS III'}</option>`).join('');
    if (atual) sel.value = atual;
}

function enviarMensagemChat() {
    const inp = document.getElementById('chat-input-texto');
    const dest = document.getElementById('chat-destinatario').value;
    const texto = (inp.value || '').trim();
    if (!texto || !usuarioLogado) return;

    const autorExibicao = `${usuarioLogado.nome} ${usuarioLogado.cargo || 'OPS III'}`.toUpperCase();

    fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            autor: usuarioLogado.usuario.toLowerCase(),
            autor_exibicao: autorExibicao,
            destinatario: dest,
            texto: texto
        })
    }).then(() => {
        inp.value = '';
        carregarMensagensChat();
    });
}

function carregarMensagensChat() {
    if (!usuarioLogado) return;
    const meuLogin = usuarioLogado.usuario.toLowerCase();
    const filtroDest = (document.getElementById('chat-destinatario').value || 'GERAL').toUpperCase();

    fetch('/api/chat?usuario=' + encodeURIComponent(meuLogin))
        .then(r => r.json())
        .then(msgs => {
            // Chat de 1 hora: só mensagens com carimbo de tempo da última hora (antigas sem carimbo são descartadas)
            const UMA_HORA = 60 * 60 * 1000;
            msgs = (Array.isArray(msgs) ? msgs : []).map(m => {
                const txt = String(m.texto || '');
                const mt = txt.match(/^\[\[ts:(\d+)\]\]/);
                const tsSrv = Number(m.timestamp);
                const ts = tsSrv ? (tsSrv < 1e12 ? tsSrv * 1000 : tsSrv) : (mt ? Number(mt[1]) : NaN);
                return { ...m, texto: mt ? txt.slice(mt[0].length) : txt, _ts: ts };
            }).filter(m => Number.isFinite(m._ts) && Date.now() - m._ts <= UMA_HORA);
            // Privacidade: mensagens privadas só para autor e destinatário
            msgs = msgs.filter(m => {
                const dest = String(m.destinatario || 'GERAL').toUpperCase();
                if (!dest.startsWith('USER:')) return true;
                return String(m.autor || '').toLowerCase() === meuLogin || dest === `USER:${meuLogin.toUpperCase()}`;
            });
            const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
            const box = document.getElementById('chat-messages-container');
            const badge = document.getElementById('badge-chat-count');
            if (badge) badge.innerText = msgs.length;
            if (!box) return;

            // Se estiver selecionado um destinatário privado no dropdown, foca na conversa privada ou mostra todas as permitidas
            const visiveis = msgs.filter(m => {
                const dest = String(m.destinatario || 'GERAL').toUpperCase();
                const autor = String(m.autor || '').toLowerCase();
                if (filtroDest.startsWith('USER:')) {
                    const alvo = filtroDest.replace('USER:', '').toLowerCase();
                    return (dest === `USER:${alvo.toUpperCase()}` && autor === meuLogin) || (dest === `USER:${meuLogin.toUpperCase()}` && autor === alvo);
                }
                return true;
            });

            box.innerHTML = visiveis.map(m => {
                const minha = m.autor.toLowerCase() === meuLogin;
                const ehPrivada = String(m.destinatario || '').toUpperCase().startsWith('USER:');
                const tagPriv = ehPrivada ? `<span style="color:var(--warning); font-weight:900;">🔒 PRIVADA</span>` : '';

                return `
                    <div class="chat-bubble ${minha ? 'minha-msg' : ''}">
                        <div class="chat-bubble-top">
                            <span>${m.autor_exibicao || m.autor.toUpperCase()} ${tagPriv}</span>
                            <span>${m.hora}</span>
                        </div>
                        <div>${esc(m.texto)}</div>
                    </div>
                `;
            }).join('');
            box.scrollTop = box.scrollHeight;
        });
}

function atualizarTodosCronometrosVagas() {
    document.querySelectorAll('.vaga-timer-badge').forEach(el => {
        const inicio = parseInt(el.getAttribute('data-inicio'));
        el.classList.remove('timer-ok', 'timer-warn', 'timer-ofensor');
        if (!inicio) { el.innerText = '00:00'; return; }

        const segs = Math.max(0, Math.floor((Date.now() - inicio) / 1000));
        const min = Math.floor(segs / 60);
        const rem = segs % 60;
        el.innerText = `${String(min).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;

        if (min >= 25) el.classList.add('timer-ofensor');
        else if (min >= 15) el.classList.add('timer-warn');
        else el.classList.add('timer-ok');
    });
}

function iniciarLoopsSincronizacao() {
    setInterval(atualizarTodosCronometrosVagas, 1000);
    setInterval(() => {
        if (!usuarioLogado || salvamentoPendente || importacaoPendente || document.activeElement?.matches('input, textarea, select')) return;
        carregarMensagensChat();
        fetch('/api/estado_coletivo')
            .then(r => r.json())
            .then(remoto => {
                if (remoto && remoto.versao && remoto.versao > versaoEstadoLocal) {
                    sincronizarDadosCompletos();
                }
            })
            .catch(() => {});
    }, 4500);
}

// v5 — PLS is shown relative to the strongest current PLS for the same process.
function comprimentoRadarPLS(c, posto) {
    const valor=numMatriz(c['pls_'+posto]);
    const max=Math.max(0,...bancoDadosReps.map(r=>numMatriz(r['pls_'+posto])));
    return max>0 ? Math.max(0,Math.min(20,20*valor/max)) : 0;
}
function corRadarPLS(c, posto) {
    const nota=c['aval_'+posto];
    if(nota && nota!=='-')return corPorNotaMatriz(nota);
    return numMatriz(c['pls_'+posto])>0 ? 'var(--success)' : 'var(--text-muted)';
}
const META_POKA_YOKE = 99.13;
function classeMetaPoka(valor) {
    if(!String(valor).trim() || !Number.isFinite(Number(String(valor).replace('%','').replace(',','.'))))return '';
    return numMatriz(valor)>=META_POKA_YOKE ? 'meta-atingida' : 'meta-abaixo';
}
function atualizarCoresHH() {
    const metas = metasHHDaCalculadora();
    document.querySelectorAll('#tbody-hh-6horas tr').forEach(tr=>{
        const ins=tr.querySelectorAll('input');
        [['bancada',0],['sorting',1],['volumoso',2]].forEach(([k,i])=>{const el=ins[i];if(!el)return;el.classList.remove('meta-atingida','meta-abaixo');const c=classeMetaHH(el.value,metas[k]);if(c)el.classList.add(c);el.title='Meta da Calculadora HC: '+metas[k]+' p/h';});
        const input=ins[3]; if(!input)return;
        input.classList.remove('meta-atingida','meta-abaixo');
        const classe=classeMetaPoka(input.value);if(classe)input.classList.add(classe);
        input.setAttribute('aria-label','Poka Yoke (%) — meta 99,13%');
    });
}
function iconeStatusRota(st) {
    const classe=st==='EXPEDIDA'?'status-expedida':st==='EM_VAGA'?'status-em-vaga':'status-pendente';
    return `<span class="status-rota ${classe}" role="img" aria-label="${escapeHTML(st)}">●</span>`;
}
function limparTabuleiroAuditoria() {
    if(!confirm('Limpar todos os postos e rotas atribuídas da Labor Auditoria?'))return;
    estadoColetivo.labAuditoria={rotasAuditadasSVC:{},auditoriaSVC:[],otimizacaoXPT:[],movimentarSVC:[],movimentarXD:[]};
    salvarEstadoColetivoSQLite();renderizarTelaAtiva();
}
function tabelasImagemLabor(menu) {
    const nomes = ns => (ns || []).filter(Boolean).join('\n') || '—';
    if (menu === 'lab_vol_chao') {
        const v = estadoColetivo.labVolChao;
        return [
            {titulo:'BANCADAS',cabecalho:['Posto','Bipador','Apoios'],linhas:v.bancadas.map(b=>[b.nome,nomes([b.onbip]),nomes(b.apoios)])},
            {titulo:'SEPARAÇÃO',cabecalho:['LM','XPT'],linhas:Array.from({length:Math.max(v.separadoresLM.length,v.separadoresXPT.length)},(_,i)=>[nomes([v.separadoresLM[i]]),nomes([v.separadoresXPT[i]])])},
            {titulo:'EXTRAS',cabecalho:['Posto','Colaboradores'],linhas:Object.entries(v.extras).map(([k,n])=>[k,nomes(n)])}
        ];
    }
    const e=migrarEsteiraParaFormatoPlanilha(menu==='lab_esteira'?estadoColetivo.labEsteira:estadoColetivo.labVolEsteira);
    const lm=e.bancadas6[0],xpt=e.bancadas6[1];
    const postos={inducao:'Indução',bipador:'Bipadores',etiquetador:'Etiquetadores',apoio:'Apoio',apoioFim:'Apoio fim'};
    const ilLM=e.ilhas.filter(i=>i.lado!=='XPT'&&i.letra),ilXPT=e.ilhas.filter(i=>i.lado==='XPT'&&i.letra);
    return [
        {titulo:'POSTOS • LM / XPT',cabecalho:['Posto','LM','XPT'],linhas:Object.entries(postos).map(([k,l])=>[k==='apoioFim'?'Operador Indução LM / Apoio XPT':l,nomes(lm[k]),nomes(xpt[k])]).concat(Object.entries(POSTOS_GOL).map(([k,l])=>['GOL · '+l,nomes((e.golPostos||{})[k]|| (k==='movimentadores'?e.gol:[])),'']))},
        {titulo:'ILHAS • LM / XPT',cabecalho:['Ilha LM','Sorting','Pesca','Ilha XPT','Sorting','Pesca'],linhas:Array.from({length:Math.max(ilLM.length,ilXPT.length)},(_,i)=>{const a=ilLM[i],b=ilXPT[i];return [a?.letra||'—',nomes(a?.sorting),nomes(a?.pesca),b?.letra||'—',nomes(b?.sorting),nomes(b?.pesca)];})}
    ];
}


// =========================================================
// v9 — STATUS OPERACIONAL (Capotado / Atenção / Flow)
// =========================================================
const STATUS_OPERACIONAL = [
    { id: 'capotado', rotulo: 'Capotado', classe: 'st-vermelho' },
    { id: 'atencao', rotulo: 'Atenção', classe: 'st-amarelo' },
    { id: 'flow', rotulo: 'Flow', classe: 'st-verde' }
];
function botoesStatusOperacional(ref, atual) {
    return `<span class="status-op" role="group" aria-label="Status operacional">${STATUS_OPERACIONAL.map(s =>
        `<button type="button" class="status-op-btn ${s.classe} ${atual === s.id ? 'ativo' : ''}" title="${s.rotulo}" aria-pressed="${atual === s.id}" onclick="event.stopPropagation(); definirStatusOperacional('${ref}', '${s.id}')">${s.rotulo}</button>`).join('')}</span>`;
}
function definirStatusOperacional(ref, valor) {
    const [tipo, chave] = ref.split(':');
    let alvo = null, campo = 'status';
    if (tipo === 'ilha') alvo = obterObjetoEsteiraAtiva().ilhas[+chave];
    else if (tipo === 'banc') alvo = estadoColetivo.labVolChao.bancadas[+chave];
    else if (tipo === 'sep') { alvo = estadoColetivo.labVolChao.statusSeparacao = estadoColetivo.labVolChao.statusSeparacao || {}; campo = chave; }
    if (!alvo) return;
    alvo[campo] = alvo[campo] === valor ? '' : valor;
    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}

// =========================================================
// v9 — EXPORTAR LABORS EM CSV (substitui a imagem)
// =========================================================
const MENUS_EXPORTAR_LABOR = ['lab_esteira', 'lab_vol_esteira', 'lab_vol_chao'];
function csvCelula(v) { const t = String(v ?? ''); return /[;"\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }
function gerarCSVLabors(segunda) {
    const titulos = { lab_esteira: 'LABOR ESTEIRA', lab_vol_chao: 'LABOR VOLUMOSO EM CHÃO', lab_vol_esteira: 'LABOR VOLUMOSO EM ESTEIRA' };
    const linhas = [];
    ['lab_esteira', segunda].forEach(menu => {
        linhas.push([titulos[menu]]);
        tabelasImagemLabor(menu).forEach(t => {
            linhas.push([t.titulo]);
            linhas.push(t.cabecalho);
            t.linhas.forEach(l => linhas.push(l.map(v => String(v).replace(/\n/g, ' | ').replace(/^—$/, ''))));
            linhas.push([]);
        });
    });
    return '\ufeff' + linhas.map(l => l.map(csvCelula).join(';')).join('\r\n');
}
function exportarLaborCSV() {
    const segunda = document.getElementById('imagem-segunda-labor').value;
    baixarArquivoTexto(gerarCSVLabors(segunda), 'Labors_SGO03_' + new Date().toISOString().slice(0, 10) + '.csv', 'text/csv;charset=utf-8');
}
function baixarArquivoTexto(texto, nome, tipo) {
    const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
    const a = document.createElement('a'); a.href = url; a.download = nome; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function atualizarFerramentaExportarLabor(codigo) {
    const el = document.getElementById('ferramenta-exportar-labor');
    if (el) el.style.display = MENUS_EXPORTAR_LABOR.includes(codigo) ? 'inline-flex' : 'none';
}

// =========================================================
// v9 — CALCULADORA HC: ESTEIRA, VOLUMOSO EM ESTEIRA E VOLUMOSO EM CHÃO
// =========================================================
// Volumoso em Esteira uses exactly the same formula as the standard belt.
function calcularHCEsteira(volume, horas, metas) {
    const cadencia = Math.round(volume / horas);
    const bancada = Math.ceil(cadencia / metas.bancada);
    const sorting = Math.ceil(cadencia / metas.sorting);
    const pesca = Math.ceil(cadencia / metas.pesca);
    const golApoio = volume > 0 ? Math.max(3, Math.ceil(sorting * 0.35)) : 0;
    return { cadencia, bancada, sorting, pesca, golApoio, total: bancada + sorting + pesca + golApoio };
}
// Volumoso em Chão: pieces-per-hour rates for on-bip, optimisation and LM/XPT separation.
function calcularHCVolChao(volume, horas, ph, bancadas = 5) {
    const cadencia = Math.round(volume / horas);
    const onbip = Math.ceil(cadencia / ph.onbip);
    const otimizacao = Math.ceil(cadencia / ph.otimizacao);
    const separacao = Math.ceil(cadencia / ph.separacao);
    return { cadencia, onbip, otimizacao, otimizacaoPorBancada: Math.ceil(otimizacao / Math.max(1, bancadas)), separacao, total: onbip + otimizacao + separacao };
}
const CAMPOS_CALC_HC = ['calc-vol','calc-pct-vol','calc-modo-vol','calc-hrs','calc-hrs-trab','calc-meta-ban','calc-meta-sor','calc-meta-pes','calc-ph-onbip','calc-ph-otim','calc-ph-sep'];
function restaurarCamposCalcHC() {
    const salvo = estadoColetivo.calcHC || {};
    CAMPOS_CALC_HC.forEach(id => { const el = document.getElementById(id); if (el && salvo[id] !== undefined && document.activeElement !== el) el.value = salvo[id]; });
}
let timerSalvarCalc = null;
function guardarCamposCalcHC() {
    const novo = {};
    CAMPOS_CALC_HC.forEach(id => { const el = document.getElementById(id); if (el) novo[id] = el.value; });
    if (JSON.stringify(novo) === JSON.stringify(estadoColetivo.calcHC || {})) return;
    estadoColetivo.calcHC = novo;
    clearTimeout(timerSalvarCalc);
    timerSalvarCalc = setTimeout(() => salvarEstadoColetivoSQLite(), 800);
}
// Targets used by H/H: the per-function rates configured in the HC calculator.
function metasHHDaCalculadora() {
    const c = estadoColetivo.calcHC || {};
    const n = (k, d) => parseFloat(c[k]) || d;
    return { bancada: n('calc-meta-ban', 1200), sorting: n('calc-meta-sor', 280), volumoso: n('calc-ph-onbip', 280) };
}
function classeMetaHH(valor, meta) {
    const v = parseFloat(String(valor).replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0 || !meta) return '';
    return v >= meta ? 'meta-atingida' : 'meta-abaixo';
}

// =========================================================
// v9 — ESCALA DE TRABALHO (mensal, pré-configuração do G&G, exportar CSV)
// =========================================================
// Codes: T = trabalha (Presente no G&G), D = DSR/folga, A = afastado/férias, '' = sem definição.
const CODIGOS_ESCALA = ['', 'T', 'D', 'A'];
const STATUS_GG_POR_CODIGO = { T: 'Escalado', D: 'DSR', A: 'Afastado' };
function mesEscalaAtual() {
    const el = document.getElementById('escala-mes');
    if (el && el.value) return el.value;
    return new Date().toISOString().slice(0, 7);
}
function diasNoMes(mes) { const [a, m] = mes.split('-').map(Number); return new Date(a, m, 0).getDate(); }
function obterEscalaMes(mes) {
    estadoColetivo.escalaTrabalho = estadoColetivo.escalaTrabalho || {};
    estadoColetivo.escalaTrabalho[mes] = estadoColetivo.escalaTrabalho[mes] || {};
    return estadoColetivo.escalaTrabalho[mes];
}
function codigoEscala(mes, nome, dia) { return ((estadoColetivo.escalaTrabalho || {})[mes]?.[nome] || [])[dia - 1] || ''; }
function definirCodigoEscala(mes, nome, dia, codigo) {
    const esc = obterEscalaMes(mes);
    const dias = esc[nome] = esc[nome] || Array(diasNoMes(mes)).fill('');
    dias[dia - 1] = codigo;
}
function alternarCelulaEscala(nome, dia) {
    const mes = mesEscalaAtual();
    const atual = codigoEscala(mes, nome, dia);
    definirCodigoEscala(mes, nome, dia, CODIGOS_ESCALA[(CODIGOS_ESCALA.indexOf(atual) + 1) % CODIGOS_ESCALA.length]);
    salvarEstadoColetivoSQLite();
    renderizarEscalaTrabalho();
}
// 5x2 preset: each collaborator works five days and rests two consecutive days, staggered across the team.
// Only the OPS II role may be scheduled in PS management.
function ehCargoOpsII(c) {
    const cargo = String((c && (c.cargo || c.vinculo)) || '').toUpperCase().replace(/\s+/g, ' ').trim();
    return cargo === 'OPSII (PS)' || cargo === 'OPS II' || cargo === 'OPSII' || cargo === 'OPS II (PS)';
}
function preConfigurarEscala5x2() {
    const mes = mesEscalaAtual();
    if (!confirm('Preencher a escala 5x2 de ' + mes + '? Dias já marcados como Afastado são mantidos.')) return;
    const total = diasNoMes(mes);
    colaboradoresEscalaFiltrados().forEach((c, i) => {
        for (let d = 1; d <= total; d++) {
            if (codigoEscala(mes, c.nome, d) === 'A') continue;
            definirCodigoEscala(mes, c.nome, d, (d + i) % 7 < 2 ? 'D' : 'T');
        }
    });
    salvarEstadoColetivoSQLite();
    renderizarEscalaTrabalho();
}
// Clears the schedule of the month currently shown. G&G statuses already applied stay as they are.
function limparEscalaTrabalho() {
    const mes = mesEscalaAtual();
    if (!confirm('Limpar toda a escala de ' + mes + '? Os status já aplicados no G&G permanecem.')) return;
    if (estadoColetivo.escalaTrabalho) delete estadoColetivo.escalaTrabalho[mes];
    estadoColetivo.escalaAplicadaEm = '';
    estadoColetivo.escalaAplicacoes = {};
    salvarEstadoColetivoSQLite();
    renderizarEscalaTrabalho();
}
function hojeISO() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
// Applies the schedule of one day to G&G statuses; collaborators without a code keep their status.
function aplicarEscalaNoGG(dataISO) {
    let alterados = 0;
    colaboradoresDaBaseEscala().forEach(c => {
        const ref = referenciaEscalaNaEntrada(c.nome, dataISO);
        const status = STATUS_GG_POR_CODIGO[ref.codigo];
        if (!status) return;
        const reg = estadoColetivo.repsEstado[c.nome] = estadoColetivo.repsEstado[c.nome] || { statusPresenca: 'Presente', horarioRetornoIntervalo: '', atividadesDirecionadas: [] };
        if (reg.statusPresenca !== status) { reg.statusPresenca = status; alterados++; }
        reg.dataTrabalhoEscala = ref.dataTrabalho;
        reg.entradaEscala = ref.dataEntrada + ' ' + ref.turno.inicio;
        reg.turnoEscala = ref.turno.nome;
        estadoColetivo.escalaAplicacoes = estadoColetivo.escalaAplicacoes || {};
        estadoColetivo.escalaAplicacoes[c.nome] = assinaturaEscalaEntrada(ref);
    });
    estadoColetivo.escalaAplicadaEm = dataISO;
    return alterados;
}
function aplicarEscalaHojeManual() {
    const n = aplicarEscalaNoGG(hojeISO());
    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
    alert('Escala de hoje aplicada no G&G (' + n + ' alterações).');
}
// Runs once per day so G&G starts pre-configured from the schedule.
function aplicarEscalaAutomaticaDoDia() {
    const hoje = hojeISO();
    if (!bancoDadosReps.length) return;
    const aplicadas = estadoColetivo.escalaAplicacoes || {};
    const pendentes = colaboradoresDaBaseEscala().filter(c => {
        const ref = referenciaEscalaNaEntrada(c.nome, hoje);
        return ref.codigo && aplicadas[c.nome] !== assinaturaEscalaEntrada(ref);
    });
    if (!pendentes.length) return;
    // Apply only changed schedules, preserving manual G&G statuses for other people.
    pendentes.forEach(c => aplicarUmaEscalaEntrada(c.nome, hoje));
    estadoColetivo.escalaAplicadaEm = hoje;
    salvarEstadoColetivoSQLite();
}
function gerarCSVEscala(mes) {
    const total = diasNoMes(mes);
    const cab = ['Nome', 'Cargo', 'Base TL', 'Turno', 'Entrada', 'Saída', 'Referência entrada', 'Observações', ...Array.from({ length: total }, (_, i) => String(i + 1).padStart(2, '0')), 'Dias T', 'DSR', 'Afastado'];
    const linhas = [cab];
    colaboradoresEscalaFiltrados().forEach(c => {
        const dias = Array.from({ length: total }, (_, i) => codigoEscala(mes, c.nome, i + 1));
        const turno = turnoColaborador(c.nome, mes);
        linhas.push([c.nome, c.cargo || c.vinculo || '', baseTL(c.nome), turno.nome, turno.inicio, turno.fim, turno.deslocamento === -1 ? 'D-1' : 'D', configEscala(c.nome, mes).obs || '', ...dias, dias.filter(x => x === 'T').length, dias.filter(x => x === 'D').length, dias.filter(x => x === 'A').length]);
    });
    return '\ufeff' + linhas.map(l => l.map(csvCelula).join(';')).join('\r\n');
}
function exportarEscalaCSV() {
    const mes = mesEscalaAtual();
    baixarArquivoTexto(gerarCSVEscala(mes), 'Escala_' + mes + '.csv', 'text/csv;charset=utf-8');
}
function renderizarEscalaTrabalho() {
    const el = document.getElementById('escala-mes');
    if (el && !el.value) el.value = hojeISO().slice(0, 7);
    const mes = mesEscalaAtual(), total = diasNoMes(mes);
    preencherFiltroTL('escala-tl');
    preencherFiltroTurno();
    const filtroData = document.getElementById('escala-data')?.value || '';
    const dias = filtroData ? (filtroData.slice(0,7) === mes ? [Number(filtroData.slice(8,10))] : []) : Array.from({length:total}, (_,i)=>i+1);
    const cab = dias.map(d => `<th>${String(d).padStart(2,'0')}</th>`).join('');
    let grupo = '';
    const linhas = colaboradoresEscalaFiltrados().map(c => {
        const t = turnoColaborador(c.nome, mes), cfg = configEscala(c.nome, mes);
        const chave = baseTL(c.nome) + ' · ' + t.nome;
        const titulo = chave !== grupo ? `<tr class="escala-grupo"><th colspan="${dias.length+4}">${escapeHTML(chave)}</th></tr>` : '';
        grupo = chave;
        const n = nomeJS(c.nome);
        const celulas = dias.map(d => {
            const cod = codigoEscala(mes,c.nome,d), data = mes+'-'+String(d).padStart(2,'0');
            const entrada = dataEntradaEscala(data,t);
            return `<td><button type="button" class="escala-cel escala-${cod || 'vazio'}" onclick="alternarCelulaEscala('${n}',${d})" aria-label="${escapeHTML(c.nome)} dia ${d}: ${cod || 'sem definição'}" title="Entrada: ${entrada} ${t.inicio} · ${t.deslocamento===-1?'D-1':'D'}">${cod}</button></td>`;
        }).join('');
        const opcoes = turnosEscala().map(x=>`<option value="${escapeHTML(x.id)}" ${x.id===t.id?'selected':''}>${escapeHTML(x.nome)}</option>`).join('');
        return titulo+`<tr><td class="escala-nome">${escapeHTML(c.nome)}<br><small>${escapeHTML(c.cargo||c.vinculo||'')}</small></td><td><select class="form-control" aria-label="Turno de ${escapeHTML(c.nome)}" onchange="definirConfigEscala('${n}','turno',this.value)">${opcoes}</select></td><td class="escala-horario">${t.inicio}–${t.fim}<br>${t.deslocamento===-1?'D-1':'D'}</td><td><input class="form-control escala-obs" aria-label="Observações de ${escapeHTML(c.nome)}" value="${escapeHTML(cfg.obs||'')}" onchange="definirConfigEscala('${n}','obs',this.value)"></td>${celulas}</tr>`;
    }).join('');
    const alvo = document.getElementById('tabela-escala-trabalho');
    if (alvo) alvo.innerHTML = `<table class="tabela-perfis tabela-escala"><thead><tr><th>Colaborador</th><th>Turno</th><th>Entrada / saída</th><th>Observações</th>${cab}</tr></thead><tbody>${linhas || `<tr><td colspan="${dias.length+4}">Nenhum colaborador neste filtro.</td></tr>`}</tbody></table>`;
    renderizarTurnosEspeciais();
}

// =========================================================
// v15 — STATUS OPERACIONAL NO CARD, LOCALIZAÇÃO, PEDIDOS ENTRE LABORS, LAYOUT E RECEBIMENTO
// =========================================================
const NOMES_LABOR = {
    lab_esteira: 'Labor Esteira', lab_vol_chao: 'Labor Volumoso em Chão', lab_vol_esteira: 'Labor Volumoso em Esteira',
    lab_auditoria: 'Labor Auditoria', lab_layout: 'Labor Layout', lab_recebimento: 'Labor Recebimento',
    exp_mapa_svc: 'Pista SVC', exp_mapa_xd: 'Pista XD', exp_xpt: 'Labor Carregamento XPT'
};
const STATUS_OPERACIONAIS = ['Operando', 'Ocioso', '5S'];
const ROTULO_STATUS_OP = { Operando: 'OPERANDO', Ocioso: 'OCIOSO', '5S': '5S' };

function equipesQuadroAtual() {
    if (submenuAtual === 'lab_recebimento') {
        if (!Array.isArray(estadoColetivo.recebEquipes)) estadoColetivo.recebEquipes = Array.from({ length: 6 }, (_, i) => ({ legenda: `Quadro ${i + 1} - Clique p/ editar legenda`, rep2: '', reps: ['', '', '', '', ''] }));
        return estadoColetivo.recebEquipes;
    }
    return estadoColetivo.xptEquipes;
}

// Status operacional: o mesmo campo do G&G, então G&G muda junto.
function proximoStatusOperacional(atual) {
    const i = STATUS_OPERACIONAIS.indexOf(atual);
    return STATUS_OPERACIONAIS[(i + 1) % STATUS_OPERACIONAIS.length];
}
function ciclarStatusOperacional(nome) { alterarStatusOperacional(nome,proximoStatusOperacional(statusOperacionalColaborador(nome))); }
function botaoStatusOperacional(nome) {
    const st=statusOperacionalColaborador(nome), n=nomeJS(nome);
    const cls=st==='Operando'?'st-op-operando':st==='Ocioso'?'st-op-ocioso':'st-op-5s';
    return `<button class="btn-status-op ${cls}" onclick="event.stopPropagation();ciclarStatusOperacional('${n}')" aria-label="Status ${ROTULO_STATUS_OP[st]||st} de ${escapeHTML(nome)}">${ROTULO_STATUS_OP[st]||st}</button>`;
}
// Colocar alguém num posto marca automaticamente como Operando.
function marcarOperandoAoAlocar(nome) { const r=estadoColetivo.repsEstado[nome]; if(r) r.statusOperacional='Operando'; }

// Onde o colaborador está (labor + posto) ou "Banco".
function localizarColaborador(nome) {
    const achados = [];
    const add = (menu, posto) => achados.push({ menu, posto });
    [['lab_esteira', estadoColetivo.labEsteira], ['lab_vol_esteira', estadoColetivo.labVolEsteira]].forEach(([menu, obj]) => {
        if (!obj) return;
        (obj.bancadas6 || []).forEach(b => {
            const lado = b.id === 'XPT' ? 'XPT' : 'LM';
            [['inducao', 'Indução'], ['bipador', 'Bancada · Bipador'], ['etiquetador', 'Bancada · Etiquetador'], ['apoio', 'Apoio'], ['apoioFim', 'Apoio'], ['gol', 'GOL']]
                .forEach(([k, rot]) => { if ((b[k] || []).includes(nome)) add(menu, `${k==='apoioFim' && lado==='LM'?'Operador Indução':rot} ${lado}`); });
        });
        (obj.ilhas || []).forEach(il => {
            const nm = il.letra ? `Ilha ${il.letra}` : 'Ilha';
            if ((il.sorting || []).includes(nome)) add(menu, `Sorting: ${nm}`);
            if ((il.pesca || []).includes(nome)) add(menu, `Pesca: ${nm}`);
            if ((il.apoio || []).includes(nome)) add(menu, `Apoio: ${nm}`);
        });
        if ((obj.gol || []).includes(nome)) add(menu, 'GOL');
        Object.entries(obj.golPostos||{}).forEach(([k,a])=>{if(a.includes(nome))add(menu,'GOL · '+POSTOS_GOL[k]);});
    });
    const vc = estadoColetivo.labVolChao;
    if (vc) {
        (vc.bancadas || []).forEach(b => {
            if (b.onbip === nome) add('lab_vol_chao', `${b.nome} · On bip`);
            if ((b.apoios || []).includes(nome)) add('lab_vol_chao', `${b.nome} · Apoio`);
        });
        if ((vc.separadoresLM || []).includes(nome)) add('lab_vol_chao', 'Separação LM');
        if ((vc.separadoresXPT || []).includes(nome)) add('lab_vol_chao', 'Separação XPT');
        Object.keys(vc.extras || {}).forEach(k => { if (vc.extras[k].includes(nome)) add('lab_vol_chao', k); });
    }
    const au = estadoColetivo.labAuditoria || {};
    [['auditoriaSVC', 'Auditoria SVC'], ['otimizacaoXPT', 'Otimização XPT'], ['movimentarSVC', 'Movimentação SVC'], ['movimentarXD', 'Movimentação XD']]
        .forEach(([k, rot]) => { if ((au[k] || []).includes(nome)) add('lab_auditoria', rot); });
    ((estadoColetivo.labLayout || {}).vagas || []).forEach((v, i) => { if (v === nome) add('lab_layout', `Vaga ${i + 1}`); });
    [['exp_xpt', estadoColetivo.xptEquipes], ['lab_recebimento', estadoColetivo.recebEquipes]].forEach(([menu, eqs]) => {
        (eqs || []).forEach((eq, i) => {
            const leg = menu === 'exp_xpt' ? `${eq.nomeVeiculo || 'Veículo '+(i+1)} · ${eq.tipoVeiculo || 'Carreta'} · Vaga ${eq.vagaCarregamento || String(i+1).padStart(2,'0')}` : `Quadro ${i + 1}`;
            if (eq.rep2 === nome) add(menu, `${leg} · REP2`);
            if ((eq.reps || []).includes(nome)) add(menu, `${leg} · REP`);
        });
    });
    Object.keys(estadoColetivo.vagasPista || {}).forEach(ch => {
        if (estadoColetivo.vagasPista[ch].rep === nome) add(ch.startsWith('XD') ? 'exp_mapa_xd' : 'exp_mapa_svc', `Vaga ${ch.split('_')[1]}`);
    });
    return achados;
}
function textoLocalColaborador(nome) {
    const a = localizarColaborador(nome);
    if (a.length) return a.map(x => `${NOMES_LABOR[x.menu] || x.menu} — ${x.posto}`).join(' | ');
    const labor = (estadoColetivo.repsEstado[nome] || {}).labor;
    return labor ? `Banco da ${NOMES_LABOR[labor] || labor}` : 'Sem direcionamento';
}
function mostrarPopupLocal(ev, nome) {
    const pop = document.getElementById('radar-popup-tooltip');
    if (!pop) return;
    pop.innerHTML = `<div style="font-weight:900; color:var(--primary); font-size:12px; margin-bottom:4px;">📍 ${escapeHTML(nome)}</div><div style="font-size:12px;">${escapeHTML(textoLocalColaborador(nome))}</div><div style="font-size:10.5px; color:var(--text-muted); margin-top:3px;">Status: ${escapeHTML(statusColaborador(nome))}</div>`;
    pop.style.display = 'block';
    pop.style.left = Math.min(window.innerWidth - 285, ev.clientX + 14) + 'px';
    pop.style.top = Math.min(window.innerHeight - 120, ev.clientY + 14) + 'px';
}

// Labor de origem do colaborador (posto atual ou banco da labor).
function laborAtualColaborador(nome) {
    const a = localizarColaborador(nome);
    if (a.length) return a[0].menu;
    return (estadoColetivo.repsEstado[nome] || {}).labor || '';
}

// "Puxar" vira solicitação: a labor de origem aprova ou recusa.
function pedidoPuxarPendente(nome) {
    return (estadoColetivo.pedidosPuxar || []).some(p => p.nome === nome);
}
function solicitarPuxarColaborador(nome) {
    if (!estadoColetivo.pedidosPuxar) estadoColetivo.pedidosPuxar = [];
    if (pedidoPuxarPendente(nome)) return;
    estadoColetivo.pedidosPuxar.push({
        id: Date.now() + Math.random(),
        nome,
        deMenu: laborAtualColaborador(nome),
        paraMenu: submenuAtual,
        solicitante: usuarioLogado ? usuarioLogado.nome : '',
        hora: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
    });
    salvarEstadoColetivoSQLite();
    abrirModalGenteGestao();
    renderizarBarraPedidosApoioGG();
}
function podeAprovarPedidoPuxar(p) {
    return p.deMenu ? submenuAtual === p.deMenu : submenuAtual !== p.paraMenu;
}
function htmlPedidosPuxar() {
    return (estadoColetivo.pedidosPuxar || []).map(p => {
        const de = NOMES_LABOR[p.deMenu] || 'Banco geral';
        const para = NOMES_LABOR[p.paraMenu] || p.paraMenu;
        const acoes = podeAprovarPedidoPuxar(p)
            ? `<button class="btn-doca-sm" style="background:var(--success); color:#000; border:none; padding:4px 8px;" onclick="responderPedidoPuxar('${p.id}', true)">✅ Aprovar</button>
               <button class="btn-doca-sm" style="padding:4px 8px;" onclick="responderPedidoPuxar('${p.id}', false)">❌ Recusar</button>`
            : (submenuAtual === p.paraMenu
                ? `<span class="sub-hint">Aguardando ${escapeHTML(de)}</span><button class="btn-doca-sm" style="padding:4px 8px;" onclick="responderPedidoPuxar('${p.id}', false)">Cancelar</button>`
                : `<span class="sub-hint">Aguardando ${escapeHTML(de)}</span>`);
        return `<div class="solicitacao-item"><span>🧲 <b>${escapeHTML(para)}</b> pede <b>${escapeHTML(p.nome)}</b> de <b>${escapeHTML(de)}</b> (${p.hora})</span>${acoes}</div>`;
    }).join('');
}
function moverColaboradorParaLabor(nome, menuDestino) {
    if (!estadoColetivo.repsEstado[nome]) estadoColetivo.repsEstado[nome] = { statusPresenca: 'Presente', atividadesDirecionadas: [] };
    const r = estadoColetivo.repsEstado[nome];
    removerColaboradorDeTodosOsPostos(nome);
    r.labor = menuDestino;
    r.statusOperacional = 'Ocioso';
    const alvo = obterFiltroAtividadesPorMenu(menuDestino)[0];
    r.atividadesDirecionadas = alvo ? [alvo] : [];
}
function responderPedidoPuxar(id, aprovado) {
    const lista = estadoColetivo.pedidosPuxar || [];
    const idx = lista.findIndex(p => String(p.id) === String(id));
    if (idx < 0) return;
    const p = lista[idx];
    if (aprovado && !podeAprovarPedidoPuxar(p)) return;
    if (aprovado) moverColaboradorParaLabor(p.nome, p.paraMenu);
    lista.splice(idx, 1);
    salvarEstadoColetivoSQLite();
    renderizarTelaAtiva();
}
// Mantém compatibilidade: puxar direto passa a gerar solicitação.
function puxarOciosoParaMinhaLabor(nome) { solicitarPuxarColaborador(nome); }

// Atender pedido de apoio escolhendo e enviando colaboradores.
let pedidoApoioEmAtendimento = null;
const selecaoAtenderApoio = new Set();
function abrirAtenderPedidoApoio(idx) {
    const p = (estadoColetivo.pedidosApoioGG || [])[idx];
    if (!p) return;
    pedidoApoioEmAtendimento = p.id;
    selecaoAtenderApoio.clear();
    document.getElementById('info-atender-apoio').innerText = `${p.origem} pediu ${p.qtd} colaborador(es). Marque quem vai.`;
    document.getElementById('busca-atender-apoio').value = '';
    renderizarListaAtenderApoio();
    document.getElementById('modal-atender-apoio').style.display = 'flex';
}
function fecharAtenderPedidoApoio() {
    document.getElementById('modal-atender-apoio').style.display = 'none';
    pedidoApoioEmAtendimento = null;
}
function candidatosAtenderApoio(p) {
    const destino = p.origemMenu || '';
    const peso = { Ocioso: 0, '5S': 1, Operando: 2 };
    return bancoDadosReps
        .filter(c => STATUS_OPERACIONAIS.includes(statusOperacionalColaborador(c.nome)) && laborAtualColaborador(c.nome) === submenuAtual && submenuAtual !== destino)
        .sort((a, b) => (peso[statusOperacionalColaborador(a.nome)] - peso[statusOperacionalColaborador(b.nome)]) || a.nome.localeCompare(b.nome));
}
function renderizarListaAtenderApoio() {
    const box = document.getElementById('lista-atender-apoio');
    const p = (estadoColetivo.pedidosApoioGG || []).find(x => x.id === pedidoApoioEmAtendimento);
    if (!box || !p) return;
    const busca = (document.getElementById('busca-atender-apoio').value || '').toLowerCase();
    box.innerHTML = candidatosAtenderApoio(p).filter(c => c.nome.toLowerCase().includes(busca)).map(c => {
        const n = c.nome.replace(/'/g, "\\'");
        return `<label class="item-atender-apoio"><input type="checkbox" ${selecaoAtenderApoio.has(c.nome) ? 'checked' : ''} onchange="this.checked ? selecaoAtenderApoio.add('${n}') : selecaoAtenderApoio.delete('${n}')"><span><b>${escapeHTML(c.nome)}</b> · ${escapeHTML(ROTULO_STATUS_OP[statusOperacionalColaborador(c.nome)] || '')}<br><small>${escapeHTML(textoLocalColaborador(c.nome))}</small></span></label>`;
    }).join('') || '<p class="sub-hint">Nenhum colaborador disponível.</p>';
}
function confirmarAtenderPedidoApoio() {
    const lista = estadoColetivo.pedidosApoioGG || [];
    const idx = lista.findIndex(x => x.id === pedidoApoioEmAtendimento);
    if (idx < 0) return fecharAtenderPedidoApoio();
    const p = lista[idx];
    if (!selecaoAtenderApoio.size) { alert('Marque ao menos um colaborador.'); return; }
    if (!p.origemMenu) { alert('Este pedido é antigo e não indica a labor de destino. Feche-o e peça de novo.'); return; }
    selecaoAtenderApoio.forEach(nome => moverColaboradorParaLabor(nome, p.origemMenu));
    lista.splice(idx, 1);
    selecaoAtenderApoio.clear();
    salvarEstadoColetivoSQLite();
    fecharAtenderPedidoApoio();
    renderizarTelaAtiva();
}

// Labor Layout: quadro único, cabeçalho livre, 5 vagas.
function renderizarLaborLayout() {
    const box = document.getElementById('container-labor-layout');
    if (!box) return;
    if (!estadoColetivo.labLayout) estadoColetivo.labLayout = { titulo: 'Layout — clique para escrever', vagas: ['', '', '', '', ''] };
    const ly = estadoColetivo.labLayout;
    box.innerHTML = `
        <div class="xpt-team-card layout-card">
            <input type="text" class="xpt-legenda-input" aria-label="Cabeçalho do Layout" value="${escapeHTML(ly.titulo)}" onchange="atualizarTituloLayout(this.value)">
            ${ly.vagas.map((n, i) => `
                <div class="doca-alocado" ondragover="event.preventDefault();" ondrop="dropRepLayout(event, ${i})">
                    ${n ? renderizarMiniCardAlocado(n, 'volumoso', `limparVagaLayout(${i})`) : `<span style="color:var(--text-muted);">👤 Vaga ${i + 1}: Arraste do Banco</span>`}
                </div>`).join('')}
        </div>`;
}
function atualizarTituloLayout(v) { estadoColetivo.labLayout.titulo = v; salvarEstadoColetivoSQLite(); }
function dropRepLayout(ev, i) {
    ev.preventDefault();
    try {
        const d = JSON.parse(ev.dataTransfer.getData('text/plain'));
        if (d.tipo !== 'REP' || !d.nome || !podeAlocarNaLabor(d.nome, 'lab_layout')) return;
        if (!estadoColetivo.repsEstado[d.nome]) estadoColetivo.repsEstado[d.nome] = { statusPresenca: 'Presente', atividadesDirecionadas: [] };
        estadoColetivo.repsEstado[d.nome].labor = 'lab_layout';
        marcarOperandoAoAlocar(d.nome);
        removerColaboradorDaFerramentaAtual(d.nome, 'lab_layout');
        estadoColetivo.labLayout.vagas[i] = d.nome;
        salvarEstadoColetivoSQLite();
        renderizarTelaAtiva();
    } catch (e) {}
}
function limparVagaLayout(i) { estadoColetivo.labLayout.vagas[i] = ''; salvarEstadoColetivoSQLite(); renderizarTelaAtiva(); }
function limparLaborLayout() {
    if (!confirm('Limpar as 5 vagas do Layout?')) return;
    estadoColetivo.labLayout.vagas = ['', '', '', '', ''];
    salvarEstadoColetivoSQLite(); renderizarTelaAtiva();
}

// v17 — management bases and calendar-safe shift entry dates.
const TURNOS_PADRAO = [
    {id:'PM',nome:'PM',inicio:'08:00',fim:'18:00',deslocamento:0},
    {id:'SD',nome:'SD',inicio:'17:00',fim:'02:00',deslocamento:0},
    {id:'MID_AM',nome:'MID AM',inicio:'21:00',fim:'05:00',deslocamento:-1},
    {id:'AM',nome:'AM',inicio:'23:00',fim:'08:00',deslocamento:-1}
];
function nomeJS(nome) { return escapeHTML(nome.replace(/\\/g,'\\\\').replace(/'/g,"\\'")); }
function turnosEscala() { return [...TURNOS_PADRAO, ...(estadoColetivo.turnosEspeciais || [])]; }
function baseTL(nome) { return (estadoColetivo.bancoGestacional || {})[nome] || 'Sem base'; }
function configEscala(nome,mes) { return (estadoColetivo.escalaConfig || {})[mes]?.[nome] || {}; }
function turnoColaborador(nome,mes) { const id=configEscala(nome,mes).turno || 'PM'; return turnosEscala().find(t=>t.id===id) || TURNOS_PADRAO[0]; }
function deslocarDataISO(data,dias) { const [a,m,d]=data.split('-').map(Number); const dt=new Date(a,m-1,d+dias,12); return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0'); }
function dataEntradaEscala(data,turno) { return deslocarDataISO(data,turno.deslocamento); }
function referenciaEscalaNaEntrada(nome,dataEntrada) {
    // Look in both calendar months at boundaries; settings belong to the work day.
    for (const dataTrabalho of [deslocarDataISO(dataEntrada,1),dataEntrada]) {
        const mes=dataTrabalho.slice(0,7), turno=turnoColaborador(nome,mes);
        if (dataEntradaEscala(dataTrabalho,turno)!==dataEntrada) continue;
        const codigo=codigoEscala(mes,nome,Number(dataTrabalho.slice(8,10)));
        if (codigo) return {dataTrabalho,dataEntrada,turno,codigo};
    }
    return {dataTrabalho:dataEntrada,dataEntrada,turno:turnoColaborador(nome,dataEntrada.slice(0,7)),codigo:''};
}
function assinaturaEscalaEntrada(r) { return ['v18',r.dataEntrada,r.dataTrabalho,r.codigo,r.turno.id,r.turno.inicio,r.turno.fim,r.turno.deslocamento].join('|'); }
function aplicarUmaEscalaEntrada(nome,data) {
    const ref=referenciaEscalaNaEntrada(nome,data), status=STATUS_GG_POR_CODIGO[ref.codigo];
    if (!status) return;
    const r=estadoColetivo.repsEstado[nome] ||= {atividadesDirecionadas:[]};
    r.statusPresenca=status; r.dataTrabalhoEscala=ref.dataTrabalho; r.entradaEscala=data+' '+ref.turno.inicio; r.turnoEscala=ref.turno.nome;
    estadoColetivo.escalaAplicacoes ||= {}; estadoColetivo.escalaAplicacoes[nome]=assinaturaEscalaEntrada(ref);
}
function definirConfigEscala(nome,campo,valor) {
    const mes=mesEscalaAtual(); estadoColetivo.escalaConfig ||= {}; estadoColetivo.escalaConfig[mes] ||= {}; estadoColetivo.escalaConfig[mes][nome] ||= {};
    estadoColetivo.escalaConfig[mes][nome][campo]=valor;
    salvarEstadoColetivoSQLite();
    // A blur-triggered note save must not replace the table while it is being removed.
    if (campo !== 'obs') renderizarEscalaTrabalho();
}
function selecionarDataEscala(data) { if (data) document.getElementById('escala-mes').value=data.slice(0,7); renderizarEscalaTrabalho(); }
function colaboradoresEscalaFiltrados() {
    const busca=(document.getElementById('escala-busca')?.value || '').toUpperCase();
    const tl=document.getElementById('escala-tl')?.value || '', turno=document.getElementById('escala-turno')?.value || '', mes=mesEscalaAtual();
    return colaboradoresDaBaseEscala().filter(c=>c.nome.toUpperCase().includes(busca) && (!tl || baseTL(c.nome)===tl) && (!turno || turnoColaborador(c.nome,mes).id===turno)).sort((a,b)=>baseTL(a.nome).localeCompare(baseTL(b.nome)) || turnoColaborador(a.nome,mes).nome.localeCompare(turnoColaborador(b.nome,mes).nome) || a.nome.localeCompare(b.nome));
}
function preencherFiltroTL(id) {
    const el=document.getElementById(id);if(!el)return;const atual=el.value;
    const bases=basesGestao().filter(b=>usuarioLogado?.cargo==='ADM'||mesmoUsuario(b.usuario,usuarioLogado?.usuario));
    el.innerHTML='<option value="">Todas as minhas bases TL</option>'+bases.map(b=>`<option value="${escapeHTML(b.tl)}">${escapeHTML(b.nome)} · ${escapeHTML(b.tl)}</option>`).join('');el.value=atual;
}
function preencherFiltroTurno() {
    const el=document.getElementById('escala-turno'); if (!el) return; const atual=el.value;
    el.innerHTML='<option value="">Todos os turnos</option>'+turnosEscala().map(t=>`<option value="${escapeHTML(t.id)}">${escapeHTML(t.nome)}</option>`).join(''); el.value=atual;
}
function atribuirBaseGestacional(nome,tl) { if(usuarioLogado?.cargo!=='ADM')return false; acaoBase({acao:'vincular',nome,tl}); return true; }
function renderizarBancoGestacional() {
    const alvo=document.getElementById('gestacional-tabela'); if(!alvo)return;
    preencherFiltroTL('gestacional-tl'); const adm=usuarioLogado?.cargo==='ADM';
    const form=document.getElementById('gestacional-criar'); if(form)form.style.display=adm?'flex':'none';
    const bases=basesGestao(), meus=bases.filter(b=>mesmoUsuario(b.usuario,usuarioLogado?.usuario));
    const options=(arr,key)=>arr.map(x=>`<option value="${escapeHTML(x[key])}">${escapeHTML(x.nome||x[key])}</option>`).join('');
    const manter=(id,html)=>{const el=document.getElementById(id);if(!el||document.activeElement===el)return;const v=el.value;el.innerHTML=html;if([...el.options].some(o=>o.value===v))el.value=v;};
    const optUsuarios=bancoUsuarios.filter(u=>cargoUsuarioNorm(u.cargo)==='TL').map(u=>`<option value="${escapeHTML(u.usuario)}">${escapeHTML(u.nome||u.usuario)} (@${escapeHTML(u.usuario)})</option>`).join('');
    if(adm){manter('base-usuario','<option value="">Usuário TL responsável…</option>'+optUsuarios);manter('base-tl','<option value="">TL no cadastro: usar nome do usuário</option>'+bancoDadosReps.slice().sort((a,b)=>a.nome.localeCompare(b.nome)).map(c=>`<option value="${escapeHTML(c.nome)}">${escapeHTML(c.nome)}</option>`).join(''));}
    const optBases=bases.map(b=>`<option value="${escapeHTML(b.tl)}">${escapeHTML(b.nome)} · TL ${escapeHTML(b.tl)}</option>`).join('');
    manter('transfer-origem',optBases); manter('transfer-destino',optBases);
    document.getElementById('transfer-form').style.display=(adm||meus.length)&&bases.length>1?'flex':'none';
    const busca=(document.getElementById('gestacional-busca')?.value||'').toUpperCase(), filtro=document.getElementById('gestacional-tl')?.value||'';
    document.getElementById('gestacional-resumo').innerHTML=bases.map(b=>`<span class="base-chip">${escapeHTML(b.nome)} · ${escapeHTML(b.tl)} (@${escapeHTML(b.usuario)}): ${bancoDadosReps.filter(c=>baseTL(c.nome)===b.tl).length}${adm?` <button class="btn-doca-sm" aria-label="Editar base ${escapeHTML(b.nome)}" onclick="editarBaseGestao('${nomeJS(b.tl)}')">✏️</button><button class="btn-doca-sm" aria-label="Excluir base ${escapeHTML(b.nome)}" onclick="excluirBaseGestao('${nomeJS(b.tl)}')">🗑️</button>`:''}</span>`).join(' ');
    alvo.innerHTML='<table class="tabela-perfis"><thead><tr><th>Colaborador</th><th>Cargo</th><th>Base TL</th></tr></thead><tbody>'+bancoDadosReps.filter(c=>c.nome.includes(busca)&&(!filtro||baseTL(c.nome)===filtro)).map(c=>`<tr><td>${escapeHTML(c.nome)}</td><td>${badgeCargo(c)}</td><td>${adm?`<select class="form-control" aria-label="Base TL de ${escapeHTML(c.nome)}" onchange="atribuirBaseGestacional('${nomeJS(c.nome)}',this.value)"><option value="">Sem base</option>${bases.filter(b=>b.tl!==c.nome).map(b=>`<option value="${escapeHTML(b.tl)}" ${baseTL(c.nome)===b.tl?'selected':''}>${escapeHTML(b.nome)} · ${escapeHTML(b.tl)}</option>`).join('')}</select>`:escapeHTML(baseTL(c.nome))}</td></tr>`).join('')+'</tbody></table>';
    const origem=document.getElementById('transfer-origem')?.value;
    manter('transfer-colaborador',bancoDadosReps.filter(c=>baseTL(c.nome)===origem).map(c=>`<option value="${escapeHTML(c.nome)}">${escapeHTML(c.nome)}</option>`).join('')||'<option value="">Base de origem sem colaboradores</option>');
    document.getElementById('gestacional-pedidos').innerHTML=(estadoColetivo.transferenciasBase||[]).filter(t=>adm||mesmoUsuario(t.solicitante,usuarioLogado?.usuario)||mesmoUsuario(t.aprovador,usuarioLogado?.usuario)).map(t=>`<article class="solicitacao-item"><span>${escapeHTML(t.nome)}: ${escapeHTML(t.de)} → ${escapeHTML(t.para)} · ${escapeHTML(t.status)}</span>${t.status==='Pendente'&&(adm||mesmoUsuario(t.aprovador,usuarioLogado?.usuario))?`<button class="btn-doca-sm" onclick="acaoBase({acao:'responder',id:'${t.id}',aprovar:true})">Aprovar</button><button class="btn-doca-sm" onclick="acaoBase({acao:'responder',id:'${t.id}',aprovar:false})">Negar</button>`:''}</article>`).join('')||'Nenhum pedido.';
}
function salvarTurnoEspecial(id,nome,inicio,fim,deslocamento) {
    if (!String(nome).trim() || !/^([01]\d|2[0-3]):[0-5]\d$/.test(inicio) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(fim) || ![0,-1].includes(Number(deslocamento))) return false;
    estadoColetivo.turnosEspeciais ||= [];
    const t={id:id||'ESP_'+Date.now(),nome:String(nome).trim(),inicio,fim,deslocamento:Number(deslocamento)};
    const i=estadoColetivo.turnosEspeciais.findIndex(x=>x.id===t.id);
    if (i<0) estadoColetivo.turnosEspeciais.push(t); else estadoColetivo.turnosEspeciais[i]=t;
    salvarEstadoColetivoSQLite(); renderizarEscalaTrabalho(); return true;
}
function gravarTurnoEspecialForm() {
    const v=id=>document.getElementById(id).value;
    if (!salvarTurnoEspecial(v('turno-id'),v('turno-nome'),v('turno-inicio'),v('turno-fim'),v('turno-ref'))) return alert('Informe nome, horários válidos e D ou D-1.');
    document.getElementById('turno-id').value=''; document.getElementById('turno-nome').value='';
}
function editarTurnoEspecial(id) {
    const t=(estadoColetivo.turnosEspeciais||[]).find(x=>x.id===id); if (!t) return;
    for (const [campo,valor] of [['id',t.id],['nome',t.nome],['inicio',t.inicio],['fim',t.fim],['ref',t.deslocamento]]) document.getElementById('turno-'+campo).value=valor;
}
function renderizarTurnosEspeciais() {
    const el=document.getElementById('turnos-especiais-lista'); if (!el) return;
    el.innerHTML=(estadoColetivo.turnosEspeciais||[]).map(t=>`<div class="turno-especial-item"><b>${escapeHTML(t.nome)}</b><span>${t.inicio}–${t.fim} · ${t.deslocamento===-1?'D-1':'D'}</span><button class="btn-doca-sm" aria-label="Editar turno ${escapeHTML(t.nome)}" onclick="editarTurnoEspecial('${nomeJS(t.id)}')">✏️ Editar</button></div>`).join('');
}

// v18: manual labor ownership; server-owned management bases and independent attendance.
const POSTOS_GOL={pescadores:'Pescadores',etiquetadores:'Etiquetadores',movimentadores:'Movimentadores'};
function garantirPostosGol(e) { e.golPostos ||= {}; Object.keys(POSTOS_GOL).forEach(k=>e.golPostos[k] ||= []); (e.gol||[]).forEach(n=>{if(n&&!Object.values(e.golPostos).flat().includes(n))e.golPostos.movimentadores.push(n);});e.gol=[]; }
function statusOperacionalColaborador(nome) { return estadoColetivo.repsEstado[nome]?.statusOperacional || 'Ocioso'; }
function alterarStatusOperacional(nome,status) { if(!['Operando','Ocioso','5S','Intervalo'].includes(status)||!laborAtualColaborador(nome))return false; const r=estadoColetivo.repsEstado[nome];r.statusOperacional=status;if(status==='Intervalo'){const d=new Date(Date.now()+3600000);r.retornoOperacional=d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}else r.retornoOperacional='';salvarEstadoColetivoSQLite();renderizarTelaAtiva();return true; }
const CARGOS_LIDERANCA=['OPSII (PS)','OPS II','OPSII','OPS III','TL'];
function podeOcuparPosto(c) { return !CARGOS_LIDERANCA.includes(String(c?.cargo||c?.vinculo||'').trim().toUpperCase()); }
function podeAlocarNaLabor(nome,menu) { if(!podeOcuparPosto(bancoDadosReps.find(c=>c.nome===nome)))return false; sincronizarLaborDirecionada(nome);return estadoColetivo.repsEstado[nome]?.labor===menu && estaDisponivelParaEscala(nome); }
function badgeCargo(c) { const cargo=c?.cargo||c?.vinculo||'REP';const icones={'REP':'●','REP II':'◆','OPSII (PS)':'🛠','OPS III':'★','TL':'👑','EXTRA':'＋'};return `<small class="cargo-badge">${icones[cargo]||'●'} ${escapeHTML(cargo)}</small>`; }
function basesGestao() { return estadoColetivo.basesGestao || []; }
function cargoUsuarioNorm(c){c=String(c||'').trim().toUpperCase();if(['ADM','ADMIN','ADMINISTRADOR','ADMINISTRAÇÃO','ADMINISTRACAO'].includes(c))return 'ADM';if(c==='TL'||/^TL[ -]/.test(c)||['TEAM LEADER','LIDER','LÍDER'].includes(c))return 'TL';return c;}
function mesmoUsuario(a,b){return String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase();}
function colaboradoresDaBaseEscala() {const bases=basesGestao().filter(b=>usuarioLogado?.cargo==='ADM'||mesmoUsuario(b.usuario,usuarioLogado?.usuario));return bancoDadosReps.filter(c=>['REP','REP II','REP2'].includes(String(c.cargo||c.vinculo||'').trim().toUpperCase())&&bases.some(b=>b.tl===baseTL(c.nome)));}
async function acaoBase(d) {try{if(d.acao==='criar'&&!String(d.nome||'').trim())throw new Error('Informe o nome da base.');if(d.acao==='criar'&&!d.usuario)throw new Error('Escolha o usuário TL responsável.');await filaSalvamento;const r=await fetch('/api/bases_gestao',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});const res=await r.json().catch(()=>({}));if(r.status===401){alert('Sua sessão expirou. Entre novamente.');fazerLogout();return;}if(!r.ok)throw new Error(res.msg||'Pedido não autorizado.');await sincronizarDadosCompletos();}catch(e){alert(e.message);} }
function criarBaseGestao() { acaoBase({acao:'criar',nome:document.getElementById('base-nome').value,usuario:document.getElementById('base-usuario').value,tl:document.getElementById('base-tl').value}); }
function solicitarTransferenciaBase() {acaoBase({acao:'solicitar',nome:document.getElementById('transfer-colaborador').value,de:document.getElementById('transfer-origem').value,para:document.getElementById('transfer-destino').value});}

// v22: ADM edits/deletes bases; one-step undo of the last saved change.
function editarBaseGestao(tl){const b=basesGestao().find(x=>x.tl===tl);if(!b)return;const nome=prompt('Nome da base:',b.nome);if(nome===null)return;const tls=bancoUsuarios.filter(u=>cargoUsuarioNorm(u.cargo)==='TL').map(u=>u.usuario);const usuario=prompt('Usuário TL responsável ('+tls.join(', ')+'):',b.usuario);if(usuario===null)return;acaoBase({acao:'editar',tl,nome,usuario:usuario.trim().replace('@','')});}
function excluirBaseGestao(tl){const b=basesGestao().find(x=>x.tl===tl);if(!b||!confirm(`Excluir a base ${b.nome}? Os colaboradores ficarão sem base.`))return;acaoBase({acao:'excluir',tl});}
let pilhaDesfazer=[];let ultimoEstadoConhecido=null;
const _salvarEstadoOriginalV22=salvarEstadoColetivoSQLite;
salvarEstadoColetivoSQLite=function(...args){if(ultimoEstadoConhecido){pilhaDesfazer.push(ultimoEstadoConhecido);if(pilhaDesfazer.length>20)pilhaDesfazer.shift();}const r=_salvarEstadoOriginalV22.apply(this,args);ultimoEstadoConhecido=JSON.stringify(estadoColetivo);atualizarBotaoDesfazer();return r;};
function lembrarEstadoAtual(){ultimoEstadoConhecido=JSON.stringify(estadoColetivo);}
function atualizarBotaoDesfazer(){document.querySelectorAll('.btn-desfazer').forEach(b=>b.disabled=!pilhaDesfazer.length);}
function desfazerUltimaAcao(){const anterior=pilhaDesfazer.pop();if(!anterior)return false;const versao=estadoColetivo.versao;estadoColetivo=JSON.parse(anterior);estadoColetivo.versao=versao;_salvarEstadoOriginalV22();lembrarEstadoAtual();atualizarBotaoDesfazer();renderizarTelaAtiva();return true;}
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')){e.preventDefault();desfazerUltimaAcao();}});
