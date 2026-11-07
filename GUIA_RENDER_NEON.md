# Hub Operacional v9 — Render + Neon (passo a passo)

O Render deixa o site no ar; o Neon guarda os dados (colaboradores, usuários, escalas, labors).
Assim nada se perde quando o Render "dorme" no plano gratuito.

## 1. Criar o banco no Neon
1. Acesse neon.tech e crie uma conta gratuita.
2. **New Project** → nome `hub-operacional` → região São Paulo (sa-east-1), se disponível.
3. Clique em **Connect**, marque **Pooled connection** e copie o endereço `postgresql://...`.
   Ele funciona como senha do banco: não compartilhe nem envie ao GitHub.

## 2. Colocar o código no GitHub
1. Crie um repositório **privado**.
2. **Add file → Upload files** e envie todo o conteúdo desta pasta (sem a pasta `data/`, se existir).

## 3. Publicar no Render
1. Acesse render.com e entre com a conta do GitHub.
2. **New → Blueprint** e escolha o repositório (o `render.yaml` já configura tudo).
   Alternativa: **New → Web Service**, Build `pip install -r requirements.txt`,
   Start `gunicorn --config gunicorn.conf.py app:app`.
3. Em **Environment**, preencha:

| Nome | Valor |
|---|---|
| `DATABASE_URL` | endereço copiado do Neon |
| `HUB_ACCESS_USER` | usuário da porta de entrada do site |
| `HUB_ACCESS_PASSWORD` | senha forte com 16+ caracteres |
| `HUB_ADMIN_PIN` | PIN inicial do usuário `brunreis` (usado só no 1º acesso) |
| `TZ` | `America/Sao_Paulo` |

4. **Deploy**. Depois abra `https://SEU-APP.onrender.com/health`: deve mostrar `"banco":"neon"`.
   Se mostrar `sqlite`, o `DATABASE_URL` não foi preenchido corretamente.

## 4. Primeiro acesso
- O navegador pede o usuário/senha de entrada (`HUB_ACCESS_USER` / `HUB_ACCESS_PASSWORD`).
- Depois entre no Hub com `brunreis` e o `HUB_ADMIN_PIN`.

## 5. Trazer dados de uma instalação antiga (opcional)
No computador, com Python instalado, dentro desta pasta:
```
pip install -r requirements.txt
set DATABASE_URL=postgresql://...      (Windows)
export DATABASE_URL=postgresql://...   (Mac/Linux)
python migrar_sqlite_para_neon.py caminho/banco_hub.db
```

## Observações
- Plano gratuito do Render: o site adormece após ~15 min sem uso e leva ~1 min para acordar.
- Fotos de tarefas/dúvidas e o chat continuam temporários (24 h e 1 h), como antes.
- Para atualizar: envie os arquivos novos ao GitHub; o Render publica sozinho.
