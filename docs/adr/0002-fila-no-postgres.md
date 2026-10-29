# ADR 0002 — Fila de tarefas no Postgres

Data: 2026-10-29 · Status: aceita

## Decisão

As tarefas de coleta e análise ficam na tabela `jobs`. O Vercel Cron chama
`/api/cron/tick` a cada 5 minutos; cada chamada reserva poucas tarefas com
`FOR UPDATE SKIP LOCKED`, executa e libera.

## Motivo

- Nenhum serviço extra para pagar ou manter.
- `chave_unica` impede tarefa duplicada; retry com espera crescente; erro visível.
- Duas execuções simultâneas nunca pegam a mesma tarefa.

## Quando rever

Se a fila passar de alguns milhares de tarefas por hora, avaliar um worker dedicado
(o código de `packages/jobs` não muda, só quem o chama).
