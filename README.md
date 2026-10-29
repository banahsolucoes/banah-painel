# Painel BANAH

Diagnóstico e gestão de contas de marketplace (Mercado Livre, Shopee) para vários clientes,
com previsão de estoque, saúde da conta e agentes de IA.

Documentos de referência: `docs/especificacao.md` e `docs/arquitetura.md`.

## Rodar na sua máquina (10 minutos)

Pré-requisitos: Git, Node.js 22, pnpm 10, Docker Desktop, Supabase CLI.

```bash
git clone https://github.com/banahsolucoes/banah-painel
cd banah-painel
pnpm install
cp .env.example .env          # preencha os valores
supabase start                # sobe Postgres + Auth locais (Docker)
pnpm db:migrate               # cria as tabelas
pnpm dev                      # abre http://localhost:3000
```

Antes de abrir um Pull Request:

```bash
pnpm check                    # lint + tipos + testes
```

## Estrutura

```
apps/web/                 Next.js: telas, API, webhooks, cron (camada fina)
packages/shared/          dinheiro em centavos, criptografia, datas, log, env
packages/db/              esquema Drizzle, migrações, conexão
packages/jobs/            fila no Postgres, executor, retry
packages/connectors/ml/   Mercado Livre: OAuth, chamadas, paginação
packages/core/            regras de negócio (estoque e previsão 60d, saúde, margem)
packages/agents/          agentes de IA (a partir da Fase 4)
docs/                     especificação, arquitetura, decisões (ADR)
```

Regra de dependência: `apps` usa `packages`; `packages/core` não depende de Next, Vercel
nem Supabase. É isso que permite trocar a hospedagem sem reescrever a lógica.

## Ambientes

| Ambiente | Branch / gatilho  | Banco          | Agentes    |
| -------- | ----------------- | -------------- | ---------- |
| Local    | sua máquina       | Supabase local | modo seco  |
| Preview  | cada Pull Request | banah-staging  | desligados |
| Staging  | merge na `main`   | banah-staging  | modo seco  |
| Produção | tag `vX.Y.Z`      | banah-prod     | por nível  |

## Como contribuir

1. Crie uma branch: `feat/…`, `fix/…` ou `chore/…`.
2. Commits no padrão Conventional Commits: `feat: previsão 60d por anúncio`.
3. Abra um Pull Request para a `main`. A esteira precisa ficar verde.
4. Release: crie a tag `vX.Y.Z` no GitHub. A esteira aplica migrações e publica a produção.

## Regras que não se quebram

- Dinheiro sempre em centavos inteiros (`Centavos`), nunca `number` decimal.
- Gravação por chave estável do canal, mesclando campo a campo.
- Todo registro carrega `cliente_id`.
- Tokens de cliente sempre cifrados (`packages/shared/src/crypto.ts`).
- Segredos só em `.env` local ou nas variáveis do Vercel. Nunca no Git.
