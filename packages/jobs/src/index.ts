import { type Db, jobs } from "@banah/db";
import { log } from "@banah/shared";
import { sql } from "drizzle-orm";
import { proximaEspera, RESERVA_EXPIRA_MIN } from "./backoff";

export * from "./backoff";

export type Job = typeof jobs.$inferSelect;
export type Handler = (job: Job) => Promise<void>;

/**
 * Enfileira uma tarefa. Mesma chave nunca gera tarefa duplicada: se já existe,
 * não faz nada. Com `reabrir: true`, uma tarefa já concluída ou que falhou
 * volta para a fila (usado para reprocessar de propósito).
 */
export async function enfileirar(
  db: Db,
  t: {
    clienteId: string;
    tipo: string;
    chaveUnica: string;
    payload?: unknown;
    executarEm?: Date;
    reabrir?: boolean;
  },
) {
  const insercao = db.insert(jobs).values({
    clienteId: t.clienteId,
    tipo: t.tipo,
    chaveUnica: t.chaveUnica,
    payload: t.payload ?? {},
    executarEm: t.executarEm ?? new Date(),
  });
  if (!t.reabrir) {
    await insercao.onConflictDoNothing({ target: jobs.chaveUnica });
    return;
  }
  await insercao.onConflictDoUpdate({
    target: jobs.chaveUnica,
    set: {
      status: "pendente",
      tentativas: 0,
      payload: sql`excluded.payload`,
      executarEm: sql`excluded.executar_em`,
      ultimoErro: null,
      atualizadoEm: sql`now()`,
    },
    setWhere: sql`${jobs.status} in ('concluido', 'falhou')`,
  });
}

/**
 * Reserva até `limite` tarefas prontas. FOR UPDATE SKIP LOCKED garante que duas
 * execuções simultâneas nunca peguem a mesma tarefa. Também recupera tarefas
 * presas em "executando" por uma execução que morreu.
 */
export async function reservar(db: Db, limite: number): Promise<Job[]> {
  const linhas = await db.execute(sql`
    update jobs set status = 'executando', reservado_em = now(),
      tentativas = tentativas + 1, atualizado_em = now()
    where id in (
      select id from jobs
      where (status = 'pendente' and executar_em <= now())
         or (status = 'executando' and reservado_em < now() - make_interval(mins => ${RESERVA_EXPIRA_MIN}))
      order by executar_em
      limit ${limite}
      for update skip locked
    )
    returning id, cliente_id as "clienteId", tipo, chave_unica as "chaveUnica", payload, status,
      tentativas, executar_em as "executarEm", reservado_em as "reservadoEm",
      ultimo_erro as "ultimoErro", criado_em as "criadoEm", atualizado_em as "atualizadoEm"
  `);
  return linhas as unknown as Job[];
}

async function concluir(db: Db, id: number) {
  await db.execute(
    sql`update jobs set status = 'concluido', ultimo_erro = null, atualizado_em = now() where id = ${id}`,
  );
}

async function registrarFalha(db: Db, job: Job, erro: unknown) {
  const msg = erro instanceof Error ? erro.message : String(erro);
  const espera = proximaEspera(job.tentativas);
  if (espera === null) {
    await db.execute(sql`update jobs set status = 'falhou', ultimo_erro = ${msg},
      atualizado_em = now() where id = ${job.id}`);
    log.error("tarefa falhou de vez", { jobId: job.id, tipo: job.tipo, erro: msg });
    return;
  }
  await db.execute(sql`update jobs set status = 'pendente', ultimo_erro = ${msg},
    executar_em = now() + make_interval(mins => ${espera}), atualizado_em = now() where id = ${job.id}`);
  log.warn("tarefa vai tentar de novo", { jobId: job.id, tipo: job.tipo, esperaMin: espera });
}

/**
 * Executa um lote de tarefas. Chamado pelo cron a cada 5 minutos.
 * Para sozinho quando o tempo acaba, deixando o resto para a próxima chamada.
 */
export async function executarLote(
  db: Db,
  handlers: Record<string, Handler>,
  opcoes: { limite?: number; tempoMaxMs?: number } = {},
) {
  const inicio = Date.now();
  const tempoMax = opcoes.tempoMaxMs ?? 240_000;
  const reservadas = await reservar(db, opcoes.limite ?? 10);
  const resultado = { reservadas: reservadas.length, ok: 0, erro: 0, adiadas: 0 };

  for (const job of reservadas) {
    if (Date.now() - inicio > tempoMax) {
      // Devolve para a fila sem contar como tentativa.
      await db.execute(sql`update jobs set status = 'pendente', tentativas = tentativas - 1,
        reservado_em = null where id = ${job.id}`);
      resultado.adiadas++;
      continue;
    }
    const handler = handlers[job.tipo];
    try {
      if (!handler) throw new Error(`Nenhum handler para o tipo de tarefa "${job.tipo}"`);
      await handler(job);
      await concluir(db, job.id);
      resultado.ok++;
    } catch (erro) {
      await registrarFalha(db, job, erro);
      resultado.erro++;
    }
  }
  return resultado;
}
