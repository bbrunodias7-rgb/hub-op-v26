"""Database access: Neon/PostgreSQL when DATABASE_URL is set, SQLite otherwise.

The app code keeps SQLite-style SQL ("?" placeholders, INSERT OR REPLACE,
BEGIN IMMEDIATE). On PostgreSQL those statements are translated here so both
backends share one code path.
"""
import os
import re
import sqlite3
from pathlib import Path

DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
USANDO_POSTGRES = DATABASE_URL.startswith(('postgres://', 'postgresql://'))

if USANDO_POSTGRES:
    import psycopg
    Error = (sqlite3.Error, psycopg.Error)
else:
    psycopg = None
    Error = (sqlite3.Error,)

# Primary keys used to translate SQLite "INSERT OR REPLACE".
CHAVES = {'usuarios': 'usuario', 'estado_coletivo': 'id', 'colaboradores': 'nome',
          'chat': 'id', 'ps_fotos': 'id'}
_LOCK_ID = 424242


class Linha(dict):
    """Row usable as row['col'], row[0] and dict(row), like sqlite3.Row."""
    def __init__(self, cols, values):
        super().__init__(zip(cols, values))
        self._valores = list(values)

    def __getitem__(self, k):
        if isinstance(k, int):
            return self._valores[k]
        return super().__getitem__(k)

    def keys(self):
        return super().keys()


def traduzir(sql):
    s = sql.strip()
    if re.match(r'(?i)^BEGIN\s+IMMEDIATE', s):
        return f'SELECT pg_advisory_xact_lock({_LOCK_ID})'
    if re.match(r'(?i)^CREATE\s+TABLE', s):
        s = re.sub(r'(?i)INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT', 'BIGSERIAL PRIMARY KEY', s)
        s = re.sub(r'(?i)\bINTEGER\b', 'BIGINT', s)
    m = re.match(r'(?is)^INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]*)\)(.*)$', s)
    if m:
        tabela, cols, resto = m.group(1), [c.strip() for c in m.group(2).split(',')], m.group(3)
        chave = CHAVES[tabela]
        sets = ', '.join(f'{c}=EXCLUDED.{c}' for c in cols if c != chave)
        s = f'INSERT INTO {tabela} ({", ".join(cols)}){resto} ON CONFLICT ({chave}) DO UPDATE SET {sets}'
    s = s.replace('%', '%%').replace('?', '%s')
    return s


class Cursor:
    def __init__(self, cur):
        self._cur = cur

    def execute(self, sql, params=()):
        self._cur.execute(traduzir(sql), tuple(params))
        return self

    def _linha(self, row):
        if row is None:
            return None
        cols = [d.name for d in self._cur.description]
        return Linha(cols, row)

    def fetchone(self):
        return self._linha(self._cur.fetchone())

    def fetchall(self):
        return [self._linha(r) for r in self._cur.fetchall()]

    @property
    def rowcount(self):
        return self._cur.rowcount


class Conexao:
    def __init__(self, conn):
        self._conn = conn

    def cursor(self):
        return Cursor(self._conn.cursor())

    def execute(self, sql, params=()):
        return self.cursor().execute(sql, params)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, tipo, *_):
        if tipo is None:
            self.commit()
        else:
            self.rollback()
        return False


def conectar(db_file):
    if USANDO_POSTGRES:
        return Conexao(psycopg.connect(DATABASE_URL, connect_timeout=15))
    Path(db_file).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_file, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def garantir_coluna(cursor, tabela, coluna, tipo):
    if USANDO_POSTGRES:
        tipo = re.sub(r'(?i)\bINTEGER\b', 'BIGINT', tipo)
        cursor.execute(f'ALTER TABLE {tabela} ADD COLUMN IF NOT EXISTS {coluna} {tipo}')
        return
    cursor.execute(f'PRAGMA table_info({tabela})')
    if coluna not in [info[1] for info in cursor.fetchall()]:
        cursor.execute(f'ALTER TABLE {tabela} ADD COLUMN {coluna} {tipo}')
