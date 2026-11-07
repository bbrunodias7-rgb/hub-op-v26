"""Copia um banco_hub.db (SQLite) para o Neon. Uso:
   DATABASE_URL='postgresql://...' python migrar_sqlite_para_neon.py caminho/banco_hub.db
Pode ser executado mais de uma vez: registros com a mesma chave são atualizados."""
import os, sqlite3, sys
if not os.environ.get('DATABASE_URL'):
    sys.exit('Defina DATABASE_URL com o endereço do Neon.')
import app, db  # app cria as tabelas no Neon

origem = sqlite3.connect(sys.argv[1] if len(sys.argv) > 1 else 'data/banco_hub.db')
origem.row_factory = sqlite3.Row
with app.get_db() as destino:
    for tabela in ('usuarios', 'colaboradores', 'estado_coletivo', 'rotas_data'):
        linhas = origem.execute(f'SELECT * FROM {tabela}').fetchall()
        if tabela == 'rotas_data':
            destino.execute('DELETE FROM rotas_data')
        for r in linhas:
            cols = [c for c in r.keys() if not (tabela == 'rotas_data' and c == 'id')]
            marc = ','.join('?' * len(cols))
            if tabela == 'rotas_data':
                destino.execute(f'INSERT INTO rotas_data ({",".join(cols)}) VALUES ({marc})', [r[c] for c in cols])
            else:
                chave = db.CHAVES[tabela]
                sets = ','.join(f'{c}=EXCLUDED.{c}' for c in cols if c != chave)
                destino.execute(f'INSERT INTO {tabela} ({",".join(cols)}) VALUES ({marc}) ON CONFLICT ({chave}) DO UPDATE SET {sets}', [r[c] for c in cols])
        print(f'{tabela}: {len(linhas)} registros')
print('Migração concluída.')
