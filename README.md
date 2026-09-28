# Meu Projeto

Base full-stack com:

- React 19 + Vite 8 no frontend
- PHP 8.2+ como API
- MySQL 8 / MariaDB compatível
- Estrutura preparada para HostGator
- Frontend preparado para desenvolvimento local e deploy separado

## Estrutura

```text
.
├── frontend/           # React + Vite
├── backend/            # API PHP
├── database/           # SQL inicial
└── .github/workflows/  # validações de CI
```

## Desenvolvimento

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

### Backend

```bash
cd backend
composer install
cp .env.example .env
php -S localhost:8000 -t public
```

A API estará em `http://localhost:8000`.

### Banco

Crie o banco MySQL e execute:

```text
database/schema.sql
```

Depois configure as credenciais somente em `backend/.env`.

## Segurança

Nunca envie para o GitHub:

- `.env`
- senhas do MySQL
- tokens
- chaves de API
- credenciais da HostGator

Use apenas os arquivos `.env.example` como modelo.
