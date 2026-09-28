# Warehouse

Aplicação full-stack para operação de armazém.

## Stack

- React 19
- Vite 8
- Vercel Functions com Node.js
- Neon PostgreSQL
- Sessão autenticada por cookie HttpOnly
- Login por CPF + senha

## Arquitetura

```text
React + Vite
     ↓
Vercel
     ↓
/api/*
     ↓
Node.js Functions
     ↓
Neon PostgreSQL
```

## Estrutura

```text
.
├── frontend/
│   ├── api/            # Vercel Functions
│   ├── src/            # React
│   ├── package.json
│   └── vite.config.js
├── database/
│   └── schema.sql      # PostgreSQL / Neon
└── .github/workflows/
```

## Vercel

O projeto deve usar:

```text
Root Directory: frontend
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

A integração Neon deve fornecer uma variável de ambiente compatível com:

```text
DATABASE_URL
```

Também são aceitas:

```text
POSTGRES_URL
POSTGRES_PRISMA_URL
```

## Banco

Execute o conteúdo de:

```text
database/schema.sql
```

no banco Neon.

O script cria:

- usuarios
- login_logs
- configuracoes
- sessoes
- usuário administrador inicial

## API

```text
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
GET  /api/health
```

## Segurança

Nunca versione credenciais, tokens ou connection strings em arquivos do Git.
