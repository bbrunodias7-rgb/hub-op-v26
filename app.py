from flask import Flask, render_template, request, jsonify, Response, session
import sqlite3
import db
from contextlib import closing
import json
import time
import csv
import io
import re
import os
import secrets
from pathlib import Path
from datetime import datetime
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
app.secret_key = os.environ.get('HUB_SESSION_SECRET') or os.environ.get('HUB_ACCESS_PASSWORD') or secrets.token_urlsafe(32)
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE='Strict', SESSION_COOKIE_SECURE=os.environ.get('HUB_SECURE_COOKIES')=='1')
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024
DB_FILE = os.environ.get('DB_FILE', str(Path(__file__).resolve().parent / 'data' / 'banco_hub.db'))


@app.after_request
def cabecalhos_seguranca(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'same-origin'
    if request.path != '/health':
        response.headers['Cache-Control'] = 'no-store'
    if request.is_secure:
        response.headers['Strict-Transport-Security'] = 'max-age=31536000'
    return response

@app.route('/health')
def health():
    if not os.environ.get('HUB_ACCESS_USER') or len(os.environ.get('HUB_ACCESS_PASSWORD', '')) < 16:
        return jsonify(status='configuration_required'), 503
    try:
        with closing(get_db()) as conn:
            conn.execute('SELECT 1 FROM estado_coletivo LIMIT 1')
        return jsonify(status='ok', banco='neon' if db.USANDO_POSTGRES else 'sqlite')
    except db.Error:
        return jsonify(status='unavailable'), 503

def get_db():
    return db.conectar(DB_FILE)

garantir_coluna = db.garantir_coluna

def init_db():
    conn = get_db()
    c = conn.cursor()

    # 1. Tabela de Usuários (Apenas brunreis por padrão)
    c.execute('''CREATE TABLE IF NOT EXISTS usuarios (
        usuario TEXT PRIMARY KEY,
        nome TEXT,
        senha TEXT,
        acessos TEXT,
        cargo TEXT DEFAULT 'OPS III',
        favoritos TEXT DEFAULT '[]'
    )''')
    garantir_coluna(c, 'usuarios', 'cargo', "TEXT DEFAULT 'OPS III'")
    garantir_coluna(c, 'usuarios', 'favoritos', "TEXT DEFAULT '[]'")

    # 2. Tabela de Colaboradores (Limpa)
    c.execute('''CREATE TABLE IF NOT EXISTS colaboradores (
        nome TEXT PRIMARY KEY,
        vinculo TEXT DEFAULT 'Efetivo',
        usuario_login TEXT DEFAULT '',
        pls_volumoso TEXT DEFAULT '-',
        unt_volumoso TEXT DEFAULT '-',
        pls_bancada TEXT DEFAULT '-',
        unt_bancada TEXT DEFAULT '-',
        pls_sorting TEXT DEFAULT '-',
        unt_sorting TEXT DEFAULT '-',
        pls_aduana TEXT DEFAULT '-',
        unt_aduana TEXT DEFAULT '-',
        aval_nao_sist TEXT DEFAULT '-',
        aval_5s TEXT DEFAULT '-',
        aval_volumoso TEXT DEFAULT '-',
        aval_bancada TEXT DEFAULT '-',
        aval_sorting TEXT DEFAULT '-',
        aval_aduana TEXT DEFAULT '-',
        aval_operador TEXT DEFAULT '-'
    )''')

    # 3. Rotas e Ilhas (ID Otimizado)
    c.execute('''CREATE TABLE IF NOT EXISTS rotas_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        onda TEXT DEFAULT '',
        id_otimizado TEXT DEFAULT '',
        tipo_servico TEXT DEFAULT '',
        vaga TEXT DEFAULT '',
        veiculo TEXT DEFAULT '',
        spr INTEGER DEFAULT 0,
        lado TEXT DEFAULT 'LM',
        status_gate TEXT DEFAULT 'PENDENTE',
        hora_entrada TEXT DEFAULT '',
        hora_saida TEXT DEFAULT '',
        timestamp_entrada INTEGER DEFAULT 0,
        timestamp_saida INTEGER DEFAULT 0
    )''')
    
    # 4. Estado Coletivo
    c.execute('''CREATE TABLE IF NOT EXISTS estado_coletivo (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        pacote_json TEXT
    )''')

    # 5. Chat Corporativo (Privacidade e Expiração)
    c.execute('''CREATE TABLE IF NOT EXISTS chat (
        id TEXT PRIMARY KEY,
        hora TEXT,
        autor TEXT,
        autor_exibicao TEXT,
        destinatario TEXT,
        texto TEXT,
        timestamp INTEGER DEFAULT 0
    )''')

    # 6. Imagens Temporárias (Problem Solver)
    c.execute('''CREATE TABLE IF NOT EXISTS ps_fotos (
        id TEXT PRIMARY KEY,
        referencia_id TEXT,
        imagem_base64 TEXT,
        timestamp INTEGER
    )''')

    garantir_coluna(c, 'chat', 'timestamp', 'INTEGER DEFAULT 0')
    garantir_coluna(c, 'colaboradores', 'usuario_login', "TEXT DEFAULT ''")
    c.execute("UPDATE colaboradores SET vinculo = CASE upper(vinculo) WHEN 'REP2' THEN 'REP II' WHEN 'OPSII' THEN 'OPSII (PS)' WHEN 'OPS' THEN 'OPS III' WHEN 'EFETIVO' THEN 'REP' ELSE vinculo END")
    agora = int(time.time())
    c.execute('DELETE FROM chat WHERE timestamp IS NULL OR timestamp = 0 OR timestamp < ? OR timestamp > ?', (agora - 3600, agora + 300))
    c.execute('DELETE FROM ps_fotos WHERE timestamp < ?', (agora - 86400,)) # Limpa fotos velhas (>24h) por segurança

    # Inserir o admin principal se não existir
    c.execute('SELECT COUNT(*) FROM usuarios')
    if c.fetchone()[0] == 0:
        c.execute('''INSERT INTO usuarios (usuario, nome, senha, acessos, cargo, favoritos)
                     VALUES (?, ?, ?, ?, ?, ?)''', 
                  ("brunreis", "BRUNO REIS", os.environ.get('HUB_ADMIN_PIN') or secrets.token_urlsafe(24), "todos", "ADM", "[]"))

    # v19: o administrador principal nunca perde acesso.
    c.execute("UPDATE usuarios SET cargo='ADM', acessos='todos' WHERE lower(trim(usuario))='brunreis'")
    c.execute("UPDATE usuarios SET cargo=upper(trim(cargo)) WHERE cargo IS NOT NULL")
    pin_adm=os.environ.get('HUB_ADMIN_PIN')
    if c.execute("SELECT COUNT(*) FROM usuarios WHERE lower(trim(usuario))='brunreis'").fetchone()[0]==0:
        c.execute('INSERT INTO usuarios (usuario, nome, senha, acessos, cargo, favoritos) VALUES (?,?,?,?,?,?)',
                  ('brunreis','BRUNO REIS',pin_adm or secrets.token_urlsafe(24),'todos','ADM','[]'))
    elif pin_adm:
        c.execute("UPDATE usuarios SET senha=? WHERE lower(trim(usuario))='brunreis'",(pin_adm,))
    conn.commit()
    conn.close()

init_db()

@app.route('/')
def index():
    return render_template('index.html')

# =========================================================
# UTILIZADORES
# =========================================================
@app.route('/api/usuarios', methods=['GET', 'POST', 'DELETE'])
def api_usuarios():
    if request.method != 'GET' and (not usuario_sessao() or usuario_sessao()['cargo'] != 'ADM'):
        return jsonify(sucesso=False,msg='Somente ADM gerencia usuários.'),403
    conn = get_db()
    c = conn.cursor()
    if request.method == 'GET':
        c.execute('SELECT usuario, nome, acessos, cargo, favoritos FROM usuarios ORDER BY nome ASC')
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        return jsonify(rows)

    if request.method == 'POST':
        d = request.json or {}
        usuario = str(d.get('usuario', '')).strip().lower().replace('@', '')
        nome = str(d.get('nome', '')).strip().upper()
        senha = str(d.get('senha', '')).strip()
        acessos = str(d.get('acessos', '')).strip()
        cargo = str(d.get('cargo', 'OPS III')).strip().upper()

        if not senha:
            existente=c.execute('SELECT senha FROM usuarios WHERE usuario=?',(usuario,)).fetchone()
            senha=existente['senha'] if existente else ''
        if not usuario or not nome or not senha:
            conn.close()
            return jsonify({"sucesso": False, "msg": "Preencha Usuário, Nome e Senha."}), 400

        c.execute('SELECT favoritos FROM usuarios WHERE lower(usuario) = ?', (usuario,))
        ex = c.fetchone()
        favs = ex['favoritos'] if ex and ex['favoritos'] else '[]'
        if usuario=='brunreis': cargo, acessos = 'ADM', 'todos'
        c.execute('''INSERT OR REPLACE INTO usuarios (usuario, nome, senha, acessos, cargo, favoritos)
                     VALUES (?, ?, ?, ?, ?, ?)''', (usuario, nome, senha, acessos, cargo, favs))
        conn.commit()
        conn.close()
        return jsonify({"sucesso": True})

    if request.method == 'DELETE':
        usuario = str(request.args.get('usuario', '')).strip().lower()
        if usuario == 'brunreis':
            conn.close()
            return jsonify({"sucesso": False, "msg": "Usuário administrador não pode ser removido."}), 403
        c.execute('DELETE FROM usuarios WHERE lower(usuario) = ?', (usuario,))
        conn.commit()
        conn.close()
        return jsonify({"sucesso": True})

# =========================================================
# ESTADO COLETIVO & COLABORADORES
# =========================================================
@app.route('/api/estado_coletivo', methods=['GET', 'POST'])
def api_estado_coletivo():
    conn = get_db()
    c = conn.cursor()
    if request.method == 'GET':
        c.execute('SELECT pacote_json FROM estado_coletivo WHERE id = 1')
        row = c.fetchone()
        conn.close()
        if row and row['pacote_json']:
            try: return jsonify(json.loads(row['pacote_json']))
            except: pass
        return jsonify({})

    if request.method == 'POST':
        pacote = request.json or {}
        c.execute('BEGIN IMMEDIATE')
        atual = ler_estado(c)
        # A pre-import client snapshot must never overwrite a newer CSV import.
        if pacote.get('versao', 0) < atual.get('ultimaImportacao', 0):
            conn.rollback()
            conn.close()
            return jsonify(sucesso=False, msg='Dados atualizados por uma importação. Atualize a tela antes de salvar.'), 409
        ator=usuario_sessao()
        # Assignments/vehicle metadata may only be changed by an internal ADM.
        def atribuicoes(e):
            return {k: v.get('rep','') for k,v in e.get('vagasPista',{}).items() if v.get('rep')}
        mudou=(atribuicoes(pacote)!=atribuicoes(atual) or pacote.get('xptEquipes',atual.get('xptEquipes',[]))!=atual.get('xptEquipes',[]))
        if mudou and (not ator or ator['cargo']!='ADM'):
            conn.rollback();conn.close()
            return jsonify(sucesso=False,msg='Somente ADM pode alterar alocações de expedição.'),403
        mudou_receb = any(pacote.get(k, atual.get(k, [])) != atual.get(k, []) for k in ('recebEquipes', 'recebVeiculos'))
        if mudou_receb and (not ator or ator['cargo'] not in ('ADM', 'TL')):
            conn.rollback();conn.close()
            return jsonify(sucesso=False,msg='Sem permissão para alterar Recebimento.'),403
        for campo, atividade in (('xptEquipes', 'Carregamento XPT'), ('recebEquipes', 'Recebimento')):
            nomes = [n for eq in pacote.get(campo, []) for n in [eq.get('rep2', ''), *eq.get('reps', [])] if n]
            if len(nomes) != len(set(nomes)):
                conn.rollback();conn.close()
                return jsonify(sucesso=False,msg='Colaborador duplicado entre vagas.'),400
            if pacote.get(campo, []) != atual.get(campo, []):
                for nome in nomes:
                    if pacote.get('repsEstado', {}).get(nome, {}).get('atividadesDirecionadas', []) != [atividade]:
                        conn.rollback();conn.close()
                        return jsonify(sucesso=False,msg='Colaborador sem direcionamento exclusivo.'),400
        ids_veiculos = [v.get('id') for eq in pacote.get('xptEquipes', []) for v in eq.get('veiculos', [])]
        if any(not isinstance(i,str) or not i.strip() for i in ids_veiculos) or len(ids_veiculos) != len(set(ids_veiculos)):
            conn.rollback();conn.close()
            return jsonify(sucesso=False,msg='Identidade de veículo inválida ou duplicada.'),400
        for chave,v in pacote.get('vagasPista',{}).items():
            m=re.fullmatch(r'(SVC|XD)_(\d{2})',chave)
            if not m or not (1<=int(m[2])<=27 if m[1]=='SVC' else 28<=int(m[2])<=58):
                conn.rollback();conn.close()
                return jsonify(sucesso=False,msg='Vaga fora dos limites da pista.'),400
        # Enforce manual ownership for new/changed lane assignments on the server.
        for chave,v in pacote.get('vagasPista',{}).items():
            nome=v.get('rep','')
            if nome and nome!=atual.get('vagasPista',{}).get(chave,{}).get('rep',''):
                atividade='Aduanda SVC' if chave.startswith('SVC_') else 'Aduanda XD'
                direcao=pacote.get('repsEstado',{}).get(nome,{}).get('atividadesDirecionadas',[])
                if direcao!=[atividade]:
                    conn.rollback();conn.close()
                    return jsonify(sucesso=False,msg='REP sem direcionamento exclusivo para esta Labor.'),400
        anteriores={n for eq in atual.get('xptEquipes',[]) for n in [eq.get('rep2',''),*eq.get('reps',[])] if n}
        for eq in pacote.get('xptEquipes',[]):
            for nome in [eq.get('rep2',''),*eq.get('reps',[])]:
                if nome and nome not in anteriores:
                    direcao=pacote.get('repsEstado',{}).get(nome,{}).get('atividadesDirecionadas',[])
                    if direcao!=['Carregamento XPT']:
                        conn.rollback();conn.close()
                        return jsonify(sucesso=False,msg='REP sem direcionamento exclusivo para Carregamento XPT.'),400
        for campo_protegido in ('basesGestao','bancoGestacional','transferenciasBase','passagensTurno'):
            pacote[campo_protegido] = atual.get(campo_protegido, [] if campo_protegido != 'bancoGestacional' else {})
        pacote['versao'] = max(int(time.time() * 1000), atual.get('versao', 0) + 1)
        c.execute('INSERT OR REPLACE INTO estado_coletivo (id, pacote_json) VALUES (1, ?)',
                  (json.dumps(pacote, ensure_ascii=False),))
        conn.commit()
        conn.close()
        return jsonify({"sucesso": True, "versao": pacote['versao']})

@app.route('/api/dados_completos', methods=['GET'])
def api_dados_completos():
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT usuario, nome, acessos, cargo, favoritos FROM usuarios ORDER BY nome ASC')
    usuarios = [dict(r) for r in c.fetchall()]
    c.execute('SELECT * FROM colaboradores ORDER BY nome ASC')
    reps = [{**dict(r), 'cargo': r['vinculo']} for r in c.fetchall()]
    c.execute('SELECT * FROM rotas_data ORDER BY id ASC')
    rotas_rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return jsonify({"sucesso": True, "usuarios": usuarios, "reps": reps, "listaRotas": rotas_rows})

# =========================================================
# CHAT CORPORATIVO (COM PRIVACIDADE)
# =========================================================
@app.route('/api/chat', methods=['GET', 'POST'])
def api_chat():
    agora = int(time.time())
    conn = get_db()
    c = conn.cursor()
    # Chat de 1 hora: remove sem carimbo, antigas e carimbos inválidos (ex.: gravados em milissegundos)
    c.execute('DELETE FROM chat WHERE timestamp IS NULL OR timestamp = 0 OR timestamp < ? OR timestamp > ?', (agora - 3600, agora + 300))
    conn.commit()

    if request.method == 'GET':
        usuario_req = request.args.get('usuario', '').lower()
        # Filtro de privacidade: só envia as mensagens se forem globais, do próprio usuário ou enviadas a ele
        c.execute('SELECT id, hora, autor, autor_exibicao, destinatario, texto, timestamp FROM chat ORDER BY timestamp ASC')
        rows = []
        for r in c.fetchall():
            dest = str(r['destinatario']).upper()
            autor = str(r['autor']).lower()
            if dest.startswith('USER:'):
                alvo = dest.replace('USER:', '').lower()
                if alvo == usuario_req or autor == usuario_req:
                    rows.append(dict(r))
            else:
                rows.append(dict(r))
        conn.close()
        return jsonify(rows)

    if request.method == 'POST':
        m = request.json or {}
        msg_id = f"{agora}_{int(time.time()*1000)%10000}"
        hora = datetime.now().strftime('%H:%M')
        autor = str(m.get('autor', '')).strip().lower()
        autor_exibicao = str(m.get('autor_exibicao', '')).strip().upper()
        destinatario = str(m.get('destinatario', 'GERAL')).strip().upper()
        texto = str(m.get('texto', '')).strip()

        if texto:
            c.execute('''INSERT INTO chat (id, hora, autor, autor_exibicao, destinatario, texto, timestamp)
                         VALUES (?, ?, ?, ?, ?, ?, ?)''',
                      (msg_id, hora, autor, autor_exibicao, destinatario, texto, agora))
            conn.commit()
        conn.close()
        return jsonify({"sucesso": True})

# =========================================================
# UPLOAD DE FOTOS (PS E DÚVIDAS)
# =========================================================
@app.route('/api/upload_foto_ps', methods=['POST'])
def upload_foto_ps():
    d = request.json or {}
    referencia_id = d.get('referencia_id') # Pode ser o ID da Tarefa ou da Dúvida
    img_b64 = d.get('imagem_base64')
    if not referencia_id or not img_b64:
        return jsonify({"sucesso": False}), 400
    
    conn = get_db()
    c = conn.cursor()
    foto_id = f"FOTO_{int(time.time()*1000)}"
    c.execute('INSERT INTO ps_fotos (id, referencia_id, imagem_base64, timestamp) VALUES (?, ?, ?, ?)',
              (foto_id, referencia_id, img_b64, int(time.time())))
    conn.commit()
    conn.close()
    return jsonify({"sucesso": True, "foto_id": foto_id})

@app.route('/api/get_fotos_ps', methods=['GET'])
def get_fotos_ps():
    ref_id = request.args.get('referencia_id')
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT id, imagem_base64 FROM ps_fotos WHERE referencia_id = ?', (ref_id,))
    fotos = [{"id": r["id"], "base64": r["imagem_base64"]} for r in c.fetchall()]
    conn.close()
    return jsonify(fotos)

@app.route('/api/deletar_fotos_ps', methods=['POST'])
def deletar_fotos_ps():
    ref_id = (request.json or {}).get('referencia_id')
    conn = get_db()
    c = conn.cursor()
    c.execute('DELETE FROM ps_fotos WHERE referencia_id = ?', (ref_id,))
    conn.commit()
    conn.close()
    return jsonify({"sucesso": True})

# =========================================================
# CONTROLE GATE (ENTRADA, SAÍDA, CANCELAR)
# =========================================================
@app.route('/api/gate_acao', methods=['POST'])
def api_gate_acao():
    d = request.json or {}
    rota_id = d.get('id')
    acao = d.get('acao') # ENTRADA, SAIDA, CANCELAR
    vaga_req = str(d.get('vaga', '')).strip()

    ts_ms = int(time.time() * 1000)
    hora_str = datetime.now().strftime('%H:%M')

    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM rotas_data WHERE id = ?', (rota_id,))
    rota = c.fetchone()
    
    if not rota:
        conn.close()
        return jsonify({"sucesso": False, "msg": "Rota não encontrada."}), 404
    
    vaga_final = vaga_req if vaga_req else rota['vaga']

    if acao == 'ENTRADA':
        c.execute('''UPDATE rotas_data SET status_gate = 'EM_VAGA', hora_entrada = ?, timestamp_entrada = ?, vaga = ? WHERE id = ?''', 
                  (hora_str, ts_ms, vaga_final, rota_id))
    elif acao == 'SAIDA':
        c.execute('''UPDATE rotas_data SET status_gate = 'EXPEDIDA', hora_saida = ?, timestamp_saida = ? WHERE id = ?''', 
                  (hora_str, ts_ms, rota_id))
    elif acao == 'CANCELAR':
        # Reverte para PENDENTE, limpa vagas e timestamps
        c.execute('''UPDATE rotas_data SET status_gate = 'PENDENTE', hora_entrada = '', hora_saida = '', timestamp_entrada = 0, timestamp_saida = 0 WHERE id = ?''', 
                  (rota_id,))

    conn.commit()
    conn.close()
    return jsonify({"sucesso": True})

# =========================================================
# LEITOR DE CSV (COLABORADORES & ROTAS/ILHAS)
# =========================================================
import unicodedata

def normalizar_chave(k):
    k = unicodedata.normalize('NFKD', str(k or '')).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', k).strip().lower()

def detectar_delimitador(texto):
    linhas = texto.splitlines()
    primeira = linhas[0] if linhas else ''
    if '\t' in primeira: return '\t'
    return ';' if primeira.count(';') >= primeira.count(',') else ','

def campo(row, *nomes):
    mapa = {normalizar_chave(k): v for k, v in row.items() if k is not None}
    for n in nomes:
        v = mapa.get(normalizar_chave(n))
        if v is not None: return str(v).strip()
    return ''

CARGOS = ('REP', 'REP II', 'OPSII (PS)', 'OPS III', 'TL', 'EXTRA')
METRICAS = ('pls_volumoso', 'unt_volumoso', 'pls_bancada', 'unt_bancada',
            'pls_sorting', 'unt_sorting', 'pls_aduana', 'unt_aduana',
            'aval_nao_sist', 'aval_5s', 'aval_volumoso', 'aval_bancada',
            'aval_sorting', 'aval_aduana', 'aval_operador')


def normalizar_cargo(v):
    cargo = str(v or '').strip().upper()
    return {'REP2': 'REP II', 'REP 2': 'REP II', 'OPSII': 'OPSII (PS)',
            'OPS II': 'OPSII (PS)', 'OPS II (PS)': 'OPSII (PS)',
            'OPS': 'OPS III', 'EFETIVO': 'REP'}.get(cargo, cargo)


def ler_estado(c):
    row = c.execute('SELECT pacote_json FROM estado_coletivo WHERE id=1').fetchone()
    return json.loads(row['pacote_json']) if row else {}


def gravar_estado(c, estado):
    estado['versao'] = max(int(time.time() * 1000), estado.get('versao', 0) + 1)
    c.execute('INSERT OR REPLACE INTO estado_coletivo (id, pacote_json) VALUES (1, ?)',
              (json.dumps(estado, ensure_ascii=False),))


@app.route('/api/colaboradores', methods=['POST', 'DELETE'])
def api_colaboradores():
    d = request.get_json(silent=True) or {}
    with closing(get_db()) as conn, conn:
        c = conn.cursor()
        if request.method == 'POST':
            nome = str(d.get('nome', '')).strip().upper()
            cargo = normalizar_cargo(d.get('cargo', d.get('vinculo', 'REP')))
            if not nome or cargo not in CARGOS:
                return jsonify(sucesso=False, msg='Informe nome e um cargo válido.'), 400
            login = str(d.get('usuario_login', '')).strip().lower().lstrip('@')
            original = str(d.get('nome_original', '') or '').strip().upper()
            if original and original != nome:
                if not c.execute('SELECT nome FROM colaboradores WHERE nome=?', (original,)).fetchone():
                    return jsonify(sucesso=False, msg='Colaborador original não encontrado.'), 404
                if c.execute('SELECT nome FROM colaboradores WHERE nome=?', (nome,)).fetchone():
                    return jsonify(sucesso=False, msg='Já existe colaborador com esse nome.'), 409
                c.execute('UPDATE colaboradores SET nome=? WHERE nome=?', (nome, original))
                estado = ler_estado(c)
                def renomear(obj):
                    if isinstance(obj, dict):
                        for k in list(obj.keys()):
                            v = obj[k]
                            if k == original: obj[nome] = obj.pop(k); k = nome
                            if isinstance(obj[k], str) and obj[k] == original: obj[k] = nome
                            else: renomear(obj[k])
                    elif isinstance(obj, list):
                        for i, v in enumerate(obj):
                            if isinstance(v, str) and v == original: obj[i] = nome
                            else: renomear(v)
                renomear(estado)
                gravar_estado(c, estado)
            if 'usuario_login' in d:
                c.execute('INSERT INTO colaboradores (nome,vinculo,usuario_login) VALUES (?,?,?) ON CONFLICT(nome) DO UPDATE SET vinculo=excluded.vinculo,usuario_login=excluded.usuario_login', (nome,cargo,login))
            else:
                c.execute("INSERT INTO colaboradores (nome,vinculo,usuario_login) VALUES (?,?,'') ON CONFLICT(nome) DO UPDATE SET vinculo=excluded.vinculo", (nome,cargo))
        else:
            nomes = d.get('nomes') or [request.args.get('nome', '')]
            if not isinstance(nomes, list):
                return jsonify(sucesso=False, msg='Seleção inválida.'), 400
            nomes = {str(n).strip().upper() for n in nomes if str(n).strip()}
            for nome in nomes:
                c.execute('DELETE FROM colaboradores WHERE nome=?', (nome,))
            estado = ler_estado(c)
            for nome in nomes:
                estado.get('repsEstado', {}).pop(nome, None)
                estado.get('labAuditoria', {}).get('rotasAuditadasSVC', {}).pop(nome, None)
            def limpar(obj):
                if isinstance(obj, dict):
                    for k, v in list(obj.items()):
                        if isinstance(v, str) and v in nomes: obj[k] = ''
                        else: limpar(v)
                elif isinstance(obj, list):
                    for i, v in enumerate(obj):
                        if isinstance(v, str) and v in nomes: obj[i] = ''
                        else: limpar(v)
            limpar(estado)
            gravar_estado(c, estado)
    return jsonify(sucesso=True)


@app.route('/api/atualizar_pls_contextual', methods=['POST'])
def atualizar_pls_contextual():
    return jsonify(sucesso=False,msg='Métricas são alteradas somente por importação bruta.'), 403


@app.route('/api/exportar_presenca_csv')
def exportar_presenca_csv():
    with closing(get_db()) as conn, conn:
        estado=ler_estado(conn.cursor())
        rows=conn.execute('SELECT nome,vinculo FROM colaboradores ORDER BY nome').fetchall()
    out=io.StringIO(); writer=csv.writer(out,delimiter=';')
    writer.writerow(['Nome','Cargo','Status','Retorno','Labor'])
    for r in rows:
        reg=estado.get('repsEstado',{}).get(r['nome'],{})
        writer.writerow([r['nome'],r['vinculo'],reg.get('statusPresenca','Presente'),reg.get('horarioRetornoIntervalo',''),reg.get('labor','')])
    return Response('\ufeff'+out.getvalue(), mimetype='text/csv',headers={'Content-Disposition':'attachment; filename=presenca.csv'})


def ler_csv(conteudo):
    linhas=conteudo.splitlines()
    for i,linha in enumerate(linhas):
        if any(normalizar_chave(t) in ('nome','colaborador','representante','nome completo','id otimizado','rota') for t in re.split('[;,\t]',linha)):
            conteudo='\n'.join(linhas[i:]); break
    try: delim=csv.Sniffer().sniff(conteudo[:10000], delimiters=';,\t').delimiter
    except csv.Error: delim=detectar_delimitador(conteudo)
    reader=csv.DictReader(io.StringIO(conteudo),delimiter=delim)
    rows=[r for r in reader if any(str(v or '').strip() for k,v in r.items() if k)]
    return rows


def numero_pacotes(v):
    v=str(v or '').strip().replace(' ', '')
    if not v: return 0
    if ',' in v: v=v.replace('.', '').replace(',', '.')
    elif re.fullmatch(r'\d{1,3}(\.\d{3})+',v): v=v.replace('.', '')
    n=float(v)
    if n<0 or not n.is_integer(): raise ValueError('Quantidade de pacotes inválida.')
    return int(n)


TOTAL_ILHAS_LADO = 20


def letra_ilha(codigo):
    # '>' is part of the island code: A and >A are different islands.
    m=re.match(r'^\s*(>?)\s*([A-Z]+)',str(codigo or '').upper())
    return m.group(1)+m.group(2) if m else str(codigo or '').strip().upper()[:2]


def tokens_ilha(nome):
    return {letra_ilha(t) for t in re.split(r'[/,+]',str(nome or '')) if t.strip()}


def nova_ilha(lado, letra=''):
    return dict(letra=letra,lado=lado,pacotes=0,sorting=[],pesca=[],apoio=[],status='')


def normalizar_ilhas(ilhas):
    lados={'LM':[], 'XPT':[]}
    for il in ilhas or []:
        lados['XPT' if il.get('lado')=='XPT' else 'LM'].append(il)
    for lado,outro in (('LM','XPT'),('XPT','LM')):
        while len(lados[lado])>TOTAL_ILHAS_LADO:
            il=lados[lado].pop()
            if il.get('letra') and len(lados[outro])<TOTAL_ILHAS_LADO:
                il['lado']=outro; lados[outro].append(il)
    out=[]
    for lado in ('LM','XPT'):
        lista=lados[lado]+[nova_ilha(lado) for _ in range(TOTAL_ILHAS_LADO-len(lados[lado]))]
        for il in lista:
            il['lado']=lado
            for k in ('sorting','pesca','apoio'): il.setdefault(k,[])
            il.setdefault('status','')
        out+=lista
    return out


def distribuir_ilhas(ilhas, pacotes_letra):
    ilhas=normalizar_ilhas(ilhas)
    for il in ilhas: il['pacotes']=0
    restantes=dict(pacotes_letra)
    for il in ilhas:
        if not il.get('letra'): continue
        for tok in tokens_ilha(il['letra']):
            for lado in (il['lado'],'XPT' if il['lado']=='LM' else 'LM'):
                if (lado,tok) in restantes:
                    il['pacotes']+=restantes.pop((lado,tok))
    for (lado,letra),pac in sorted(restantes.items()):
        livres=[i for i in ilhas if not i.get('letra') and i['lado']==lado] or [i for i in ilhas if not i.get('letra')]
        if not livres: raise ValueError(f'Sem espaço para a ilha {letra}: as 40 ilhas já têm nome.')
        livres[0].update(letra=letra,pacotes=pac)
    return ilhas


def extrair_rotas(rows, exigir_vaga=False):
    rotas={}
    for idx,row in enumerate(rows,2):
        codigo=campo(row,'id otimizado','id_otimizado','rota').upper()
        if not codigo: raise ValueError(f'Linha {idx}: ID Otimizado / Rota ausente.')
        pacotes=campo(row,'pacotes estimados','pacotes','spr','volume')
        if not pacotes: raise ValueError(f'Linha {idx}: quantidade de pacotes ausente.')
        vaga_texto=campo(row,'vaga','pista','doca','vaga de expedicao')
        vaga=re.sub(r'\D','',vaga_texto)
        if exigir_vaga and (not vaga or not 1<=int(vaga)<=58):
            raise ValueError(f'Linha {idx}: informe Vaga/Pista de 01 a 58.')
        tipo=campo(row,'tipos de servicos','tipo de servico','tipo_servico','servico').upper()
        lado='XPT' if 'XPT' in tipo else 'LM'
        r=rotas.setdefault(codigo,dict(id_otimizado=codigo,onda=campo(row,'onda','wave'),tipo_servico=tipo,veiculo=campo(row,'tipo de veiculo','veiculo'),spr=0,lado=lado,vaga=str(int(vaga)).zfill(2) if vaga else ''))
        if vaga and r['vaga'] and int(vaga)!=int(r['vaga']): raise ValueError(f'Rota {codigo}: vagas conflitantes.')
        r['spr']+=numero_pacotes(pacotes)
    if not rotas: raise ValueError('Nenhuma rota válida no arquivo.')
    return list(rotas.values())


@app.route('/api/upload_csv_bruto', methods=['POST'])
def api_upload_csv_bruto():
    tipo=request.form.get('tipo')
    if tipo not in ('colaboradores','matriz','rotas','expedicao'):
        return jsonify(sucesso=False,msg='Tipo de importação inválido.'),400
    arquivo=request.files.get('arquivo')
    if not arquivo: return jsonify(sucesso=False,msg='Selecione um arquivo.'),400
    bruto=arquivo.read()
    try: texto=bruto.decode('utf-8-sig')
    except UnicodeDecodeError: texto=bruto.decode('cp1252')
    rows=ler_csv(texto.strip())
    if not rows: return jsonify(sucesso=False,msg='CSV vazio ou sem cabeçalho e registros.'),400
    conn=get_db(); c=conn.cursor()
    try:
        c.execute('BEGIN IMMEDIATE')
        total=0
        if tipo=='colaboradores':
            for idx,row in enumerate(rows,2):
                nome=campo(row,'nome','nome completo','colaborador','representante').upper()
                cargo=normalizar_cargo(campo(row,'cargo'))
                if not nome or cargo not in CARGOS: raise ValueError(f'Linha {idx}: informe Nome e Cargo (REP, REP II, OPSII (PS), OPS III, TL ou EXTRA).')
                c.execute('INSERT INTO colaboradores (nome,vinculo) VALUES (?,?) ON CONFLICT(nome) DO UPDATE SET vinculo=excluded.vinculo',(nome,cargo)); total+=1
        elif tipo=='matriz':
            aliases={m: [m,m.replace('_',' ')] for m in METRICAS}
            aliases['pls_aduana']+=['pls aduanda']; aliases['unt_aduana']+=['unt aduanda']
            for posto in ('volumoso','bancada','sorting','aduana','operador'):
                aliases['aval_'+posto] += ['aval. '+posto, 'avaliacao '+posto, 'nota '+posto]
            aliases['aval_aduana'] += ['aval. aduanda', 'avaliacao aduanda']
            aliases['aval_5s'] += ['aval. 5s', 'avaliacao 5s']
            aliases['aval_nao_sist']+=['aval. nao sistemica','avaliacao nao sistemica']
            for idx,row in enumerate(rows,2):
                nome=campo(row,'nome','colaborador','representante','representantes','nome completo').upper()
                if not nome: raise ValueError(f'Linha {idx}: nome ausente.')
                if not c.execute('SELECT 1 FROM colaboradores WHERE nome=?',(nome,)).fetchone():
                    raise ValueError(f'Linha {idx}: {nome} não está no cadastro. Importe o cadastro primeiro.')
                valores={m:campo(row,*aliases[m]) for m in METRICAS}
                posto=normalizar_chave(campo(row,'posto','atividade','processo')).replace('aduanda','aduana')
                if posto in ('volumoso','bancada','sorting','aduana'):
                    for metrica in ('pls','unt'):
                        val=campo(row,metrica)
                        if val: valores[f'{metrica}_{posto}']=val
                valores={k:v for k,v in valores.items() if v}
                if not valores: raise ValueError(f'Linha {idx}: não há indicadores PLS/UNT reconhecidos.')
                c.execute('UPDATE colaboradores SET '+','.join(f'{m}=?' for m in valores)+' WHERE nome=?',tuple(valores.values())+(nome,)); total+=1
        elif tipo=='rotas':
            rotas=extrair_rotas(rows)
            estado=ler_estado(c); estado['rotasLabor']=rotas
            estado['totalPacotesDiaCSV']=sum(r['spr'] for r in rotas)
            # v12 — the route CSV fills only the ID (cart) bank; the TL places IDs on islands.
            validos={r['id_otimizado'] for r in rotas}
            for lab in ('labEsteira','labVolEsteira'):
                atual=estado.setdefault(lab,dict(formato='planilha',bancadas6=[dict(id=lado,nome='Lado '+lado,**{k:[] for k in ('inducao','bipador','etiquetador','apoio','apoioFim')}) for lado in ('LM','XPT')],gol=[]))
                atual['ilhas']=normalizar_ilhas(atual.get('ilhas',[]))
                for il in atual['ilhas']:
                    il['ids']=[i for i in il.get('ids',[]) if i in validos]
            estado['ultimaImportacao']=max(int(time.time()*1000),estado.get('versao',0)+1)
            gravar_estado(c,estado); total=len(rotas)
        else:
            rotas=extrair_rotas(rows,exigir_vaga=True)
            c.execute('DELETE FROM rotas_data')
            estado=ler_estado(c); vagas=estado.setdefault('vagasPista',{})
            for v in vagas.values():
                v.update(rota='',spr=0,onda='',inicioTimer=None)
            for r in rotas:
                c.execute("INSERT INTO rotas_data (onda,id_otimizado,tipo_servico,vaga,veiculo,spr,lado,status_gate) VALUES (?,?,?,?,?,?,?,'PENDENTE')", (r['onda'],r['id_otimizado'],r['tipo_servico'],r['vaga'],r['veiculo'],r['spr'],r['lado']))
                setor='XD' if int(r['vaga'])>=28 else 'SVC'; chave=f"{setor}_{r['vaga']}"
                v=vagas.setdefault(chave,{'rep':''})
                v.update(rota=' / '.join(filter(None,[v.get('rota'),r['id_otimizado']])),spr=v.get('spr',0)+r['spr'],onda=r['onda'],inicioTimer=None)
            estado['ultimaImportacao']=max(int(time.time()*1000),estado.get('versao',0)+1)
            gravar_estado(c,estado); total=len(rotas)
        if tipo in ('matriz','colaboradores'):
            estado=ler_estado(c)
            estado['ultimaImportacao']=max(int(time.time()*1000),estado.get('versao',0)+1)
            gravar_estado(c,estado)
        conn.commit()
        return jsonify(sucesso=True,total=total)
    except (ValueError,csv.Error) as e:
        conn.rollback(); return jsonify(sucesso=False,msg=str(e)),400
    except db.Error:
        conn.rollback(); return jsonify(sucesso=False,msg='Falha ao salvar os dados. Nenhum registro foi importado.'),500
    finally: conn.close()


# v20: tolerant role names so ADM/TL are never lost to spelling.
def normalizar_cargo_usuario(cargo):
    c=str(cargo or '').strip().upper()
    if c in ('ADM','ADMIN','ADMINISTRADOR','ADMINISTRAÇÃO','ADMINISTRACAO'):return 'ADM'
    if c=='TL' or c.startswith('TL ') or c.startswith('TL-') or c in ('TEAM LEADER','LIDER','LÍDER'):return 'TL'
    return c

# v18: verified internal identity; management fields cannot be overwritten by snapshots.
def usuario_sessao():
    login=session.get('usuario')
    if not login: return None
    with closing(get_db()) as conn:
        r=conn.execute('SELECT usuario,nome,cargo,acessos,favoritos FROM usuarios WHERE lower(trim(usuario))=lower(trim(?))',(login,)).fetchone()
    if not r: return None
    u=dict(r); u['cargo']=normalizar_cargo_usuario(u.get('cargo'))
    if u['usuario'].strip().lower()=='brunreis': u['cargo']='ADM'; u['acessos']='todos'
    return u

@app.route('/api/login',methods=['POST'])
def login_interno():
    d=request.get_json(silent=True) or {}
    with closing(get_db()) as conn:
        r=conn.execute('SELECT * FROM usuarios WHERE lower(trim(usuario))=?',(str(d.get('usuario','')).strip().lower().lstrip('@'),)).fetchone()
    if not r or not secrets.compare_digest(str(r['senha'] or '').strip().encode(),str(d.get('senha','')).strip().encode()):
        return jsonify(sucesso=False),401
    session.clear();session['usuario']=r['usuario']
    return jsonify(sucesso=True,usuario=usuario_sessao())

@app.route('/api/sessao')
def sessao_interna(): return jsonify(usuario=usuario_sessao())

@app.route('/api/logout',methods=['POST'])
def logout_interno(): session.clear();return jsonify(sucesso=True)

# v21: Handover is server-owned and delivered once to the next different ADM.
@app.route('/api/passagem_turno', methods=['GET','POST'])
def passagem_turno():
    ator=usuario_sessao()
    if not ator: return jsonify(msg='Entre novamente.'),401
    if ator['cargo']!='ADM': return jsonify(msg='Apenas ADM.'),403
    with closing(get_db()) as conn:
        c=conn.cursor()
        if request.method=='POST': c.execute('BEGIN IMMEDIATE')
        e=ler_estado(c); historico=e.setdefault('passagensTurno',[])
        if request.method=='GET':
            pendente=next((h for h in reversed(historico) if not h.get('cientePor') and h['autor']!=ator['usuario']),None)
            return jsonify(pendente=pendente)
        d=request.get_json(silent=True) or {}
        turno=str(d.get('turno','')).strip();obs=str(d.get('observacoes','')).strip();resumo=str(d.get('resumo','')).strip()
        if turno not in ('PM','SD','MID AM','AM') or not obs or len(obs)>10000 or len(resumo)>20000:
            return jsonify(msg='Informe turno e observações válidos.'),400
        from zoneinfo import ZoneInfo
        agora=datetime.now(ZoneInfo('America/Sao_Paulo'))
        h=dict(id=secrets.token_hex(12),autor=ator['usuario'],turno=turno,data=agora.strftime('%d/%m/%Y'),criadoEm=agora.isoformat(),observacoes=obs,resumo=resumo,cientePor=None,
               veiculos=json.loads(json.dumps(e.get('xptEquipes',[]))))
        historico.append(h);gravar_estado(c,e);conn.commit()
        return jsonify(sucesso=True,id=h['id'])

@app.route('/api/passagem_turno/ciente',methods=['POST'])
def confirmar_passagem_turno():
    ator=usuario_sessao()
    if not ator: return jsonify(msg='Entre novamente.'),401
    if ator['cargo']!='ADM': return jsonify(msg='Apenas ADM.'),403
    d=request.get_json(silent=True) or {}
    with closing(get_db()) as conn:
        c=conn.cursor();c.execute('BEGIN IMMEDIATE');e=ler_estado(c)
        h=next((h for h in e.get('passagensTurno',[]) if h['id']==d.get('id')),None)
        if not h: return jsonify(msg='Passagem não encontrada.'),404
        if h['autor']==ator['usuario']: return jsonify(msg='O próximo ADM deve confirmar.'),403
        if not h.get('cientePor'): h['cientePor']=ator['usuario'];h['cienteEm']=datetime.now().isoformat();gravar_estado(c,e)
        conn.commit();return jsonify(sucesso=True)

@app.route('/api/bases_gestao',methods=['POST'])
def bases_gestao():
    ator=usuario_sessao()
    if not ator:return jsonify(sucesso=False,msg='Entre novamente no sistema.'),401
    d=request.get_json(silent=True) or {};acao=d.get('acao')
    with closing(get_db()) as conn:
        c=conn.cursor();c.execute('BEGIN IMMEDIATE')
        e=ler_estado(c);bases=e.setdefault('basesGestao',[]);vinc=e.setdefault('bancoGestacional',{});pedidos=e.setdefault('transferenciasBase',[])
        def falha(msg,status=403):conn.rollback();return jsonify(sucesso=False,msg=msg),status
        def base(tl):return next((b for b in bases if b['tl']==tl),None)
        mesmo=lambda a,b:str(a or '').strip().lower()==str(b or '').strip().lower()
        if acao in ('criar','vincular'):
            if ator['cargo']!='ADM':return falha('Somente ADM monta as bases.')
            tl=str(d.get('tl') or '').strip();nome=str(d.get('nome') or '').strip()
            if acao=='criar':
                u=c.execute('SELECT usuario,nome,cargo FROM usuarios WHERE lower(trim(usuario))=lower(trim(?))',(str(d.get('usuario') or ''),)).fetchone()
                if not nome:return falha('Informe o nome da base.',400)
                if not u:return falha('Escolha o usuário TL responsável.',400)
                if normalizar_cargo_usuario(u['cargo'])!='TL':return falha('O usuário escolhido não tem cargo TL em Usuários.',400)
                if tl:
                    if not c.execute('SELECT nome FROM colaboradores WHERE nome=?',(tl,)).fetchone():return falha('TL não encontrado no cadastro de colaboradores.',400)
                else:tl=str(u['nome'] or u['usuario']).strip().upper()
                if any(mesmo(b['usuario'],u['usuario']) and b['tl']!=tl for b in bases):return falha('Esse usuário já responde por outra base.',400)
                registro={'nome':nome,'usuario':u['usuario'],'tl':tl}
                antigo=base(tl)
                if antigo:antigo.update(registro)
                else:bases.append(registro)
            else:
                if not c.execute('SELECT nome FROM colaboradores WHERE nome=?',(nome,)).fetchone() or nome==tl or (tl and not base(tl)):return falha('Colaborador ou base inválidos.',400)
                if tl:vinc[nome]=tl
                else:vinc.pop(nome,None)
        elif acao in ('editar','excluir'):
            if ator['cargo']!='ADM':return falha('Somente ADM edita as bases.')
            alvo=base(str(d.get('tl') or ''))
            if not alvo:return falha('Base não encontrada.',404)
            if acao=='excluir':
                bases.remove(alvo)
                for n in [n for n,t in vinc.items() if t==alvo['tl']]:vinc.pop(n,None)
                for t in pedidos:
                    if t['status']=='Pendente' and alvo['tl'] in (t['de'],t['para']):t['status']='Cancelado'
            else:
                nome=str(d.get('nome') or '').strip()
                if not nome:return falha('Informe o nome da base.',400)
                u=c.execute('SELECT usuario,cargo FROM usuarios WHERE lower(trim(usuario))=lower(trim(?))',(str(d.get('usuario') or ''),)).fetchone()
                if not u or normalizar_cargo_usuario(u['cargo'])!='TL':return falha('Escolha um usuário com cargo TL.',400)
                if any(b is not alvo and mesmo(b['usuario'],u['usuario']) for b in bases):return falha('Esse usuário já responde por outra base.',400)
                alvo['nome']=nome
                if not mesmo(alvo['usuario'],u['usuario']):
                    alvo['usuario']=u['usuario']
                    for t in pedidos:
                        if t['status']=='Pendente' and alvo['tl'] in (t['de'],t['para']):t['status']='Cancelado'
        elif acao=='solicitar':
            de=d.get('de');para=d.get('para');nome=d.get('nome');orig=base(de);dest=base(para)
            if not orig or not dest or de==para:return falha('Escolha bases de origem e destino diferentes.',400)
            if vinc.get(nome)!=de:return falha('Esse colaborador não está na base de origem.',400)
            if ator['cargo']=='ADM':vinc[nome]=para
            else:
                if ator['cargo']!='TL' or not (mesmo(ator['usuario'],orig['usuario']) or mesmo(ator['usuario'],dest['usuario'])):return falha('Apenas os TLs das duas bases podem solicitar.')
                if mesmo(orig['usuario'],dest['usuario']):vinc[nome]=para
                else:
                    if any(t['nome']==nome and t['status']=='Pendente' for t in pedidos):return falha('Já existe pedido pendente.',409)
                    pedidos.append({'id':secrets.token_hex(12),'nome':nome,'de':de,'para':para,'solicitante':ator['usuario'],'aprovador':dest['usuario'] if mesmo(ator['usuario'],orig['usuario']) else orig['usuario'],'status':'Pendente','criadoEm':int(time.time())})
        elif acao=='responder':
            t=next((t for t in pedidos if t['id']==d.get('id')),None)
            if not t or t['status']!='Pendente':return falha('Pedido indisponível.',409)
            if not (ator['cargo']=='ADM' or (ator['cargo']=='TL' and mesmo(ator['usuario'],t['aprovador']) and not mesmo(ator['usuario'],t['solicitante']))):return falha('Somente o outro TL pode decidir.')
            orig=base(t['de']);dest=base(t['para'])
            if not orig or not dest or (ator['cargo']!='ADM' and not (mesmo(ator['usuario'],orig['usuario']) or mesmo(ator['usuario'],dest['usuario']))):return falha('Responsáveis da base alterados.',409)
            if vinc.get(t['nome'])!=t['de']:return falha('Colaborador já mudou de base.',409)
            if not isinstance(d.get('aprovar'),bool):return falha('Decisão inválida.',400)
            t['status']='Aprovado' if d['aprovar'] else 'Negado';t['decididoPor']=ator['usuario'];t['decididoEm']=int(time.time())
            if d['aprovar']:vinc[t['nome']]=t['para']
        else:return falha('Ação inválida.',400)
        gravar_estado(c,e);conn.commit()
    return jsonify(sucesso=True)

if __name__ == '__main__':
    app.run(host='0.0.0.0',port=int(os.environ.get('PORT','5000')),debug=False)
