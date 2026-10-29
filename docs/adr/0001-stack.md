# ADR 0001 — Stack do Painel BANAH

Data: 2026-10-29 · Status: aceita

## Decisão

TypeScript em tudo; Next.js no Vercel Pro para telas e API; Postgres no Supabase para dados,
login e arquivos; Drizzle ORM com migrações no Git; fila em tabela do próprio Postgres;
GitHub Actions para a esteira.

## Motivo

- O Apps Script limita execução a 6 minutos, guarda estado em Script Properties com teto de
  tamanho e não separa clientes. Não escala para vários clientes.
- Vercel Pro já é pago. Supabase tem plano gratuito suficiente para dois clientes.
- Postgres e Drizzle funcionam em qualquer hospedagem: não ficamos presos a fornecedor.
- Uma linguagem só reduz o custo de manter e de trazer outra pessoa para o projeto.

## Consequências

- O financeiro (Financeiro_Br) continua no Apps Script até a migração da Fase 6.
- Tarefas longas precisam ser quebradas em tarefas curtas na fila.
