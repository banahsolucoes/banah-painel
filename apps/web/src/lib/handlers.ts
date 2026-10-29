import { coletarAnuncios, coletarPedidos, mlGet, obterAccessToken } from "@banah/connector-ml";
import { contasCanal, db } from "@banah/db";
import { enfileirar, type Handler } from "@banah/jobs";
import { diaLocal, log } from "@banah/shared";
import { eq } from "drizzle-orm";
import { chaveTokens, mlApp } from "./config";

/** Dias de histórico de pedidos puxados na conexão (60 da previsão + folga). */
export const DIAS_CARGA_INICIAL = 91;
const DIAS_POR_JANELA = 13;

async function contaComToken(contaId: string) {
  const conta = await db().query.contasCanal.findFirst({ where: eq(contasCanal.id, contaId) });
  if (!conta) throw new Error(`Conta ${contaId} não existe mais`);
  const token = await obterAccessToken(db(), contaId, mlApp(), chaveTokens());
  return { conta, token };
}

type PayloadPedidos = {
  contaId: string;
  campo: "date_created" | "date_last_updated";
  de: string;
  ate: string;
  conferencia: string;
};

/**
 * Tarefas que o executor sabe rodar. Cada fase acrescenta as suas aqui.
 */
export const handlers: Record<string, Handler> = {
  /** Fase 0: o token continua válido e renovando sozinho. */
  "ml.verificar_token": async (job) => {
    const { contaId } = job.payload as { contaId: string };
    const { token } = await contaComToken(contaId);
    const eu = await mlGet<{ id: number; nickname: string }>(token, "/users/me");
    await db()
      .update(contasCanal)
      .set({ apelido: eu.nickname, atualizadoEm: new Date() })
      .where(eq(contasCanal.id, contaId));
    log.info("token ML conferido", { contaId, sellerId: eu.id });
  },

  /** Ao conectar: anúncios agora + 91 dias de pedidos em janelas curtas. */
  "ml.carga_inicial": async (job) => {
    const { contaId } = job.payload as { contaId: string };
    await enfileirar(db(), {
      clienteId: job.clienteId,
      tipo: "ml.anuncios",
      chaveUnica: `ml.anuncios:${contaId}:carga`,
      payload: { contaId },
    });
    const agora = Date.now();
    for (let fim = 0; fim < DIAS_CARGA_INICIAL; fim += DIAS_POR_JANELA) {
      const ate = new Date(agora - fim * 864e5);
      const de = new Date(agora - Math.min(fim + DIAS_POR_JANELA, DIAS_CARGA_INICIAL) * 864e5);
      await enfileirar(db(), {
        clienteId: job.clienteId,
        tipo: "ml.pedidos",
        chaveUnica: `ml.pedidos:${contaId}:carga:${fim}`,
        payload: {
          contaId,
          campo: "date_created",
          de: de.toISOString(),
          ate: ate.toISOString(),
          conferencia: `ml.pedidos.carga.${String(fim).padStart(2, "0")}`,
        } satisfies PayloadPedidos,
      });
    }
  },

  "ml.anuncios": async (job) => {
    const { contaId } = job.payload as { contaId: string };
    const { conta, token } = await contaComToken(contaId);
    const r = await coletarAnuncios(db(), conta, token);
    log.info("anúncios coletados", { contaId, ...r });
  },

  "ml.pedidos": async (job) => {
    const p = job.payload as PayloadPedidos;
    const { conta, token } = await contaComToken(p.contaId);
    const r = await coletarPedidos(
      db(),
      conta,
      token,
      { campo: p.campo, de: new Date(p.de), ate: new Date(p.ate) },
      { tipo: p.conferencia, dia: diaLocal() },
    );
    log.info("pedidos coletados", { contaId: p.contaId, ...r });
  },
};

/**
 * Agenda as tarefas recorrentes de uma conta ML. Idempotente: a chave de cada
 * tarefa inclui o dia ou o bloco de 6 horas, então chamar várias vezes não duplica.
 */
export async function agendarConta(conta: typeof contasCanal.$inferSelect) {
  const hoje = diaLocal();
  const bloco = `${hoje}b${Math.floor(new Date().getUTCHours() / 6)}`;
  const base = { clienteId: conta.clienteId };

  await enfileirar(db(), {
    ...base,
    tipo: "ml.verificar_token",
    chaveUnica: `ml.verificar_token:${conta.id}:${hoje}`,
    payload: { contaId: conta.id },
  });
  await enfileirar(db(), {
    ...base,
    tipo: "ml.carga_inicial",
    chaveUnica: `ml.carga_inicial:${conta.id}`,
    payload: { contaId: conta.id },
  });
  await enfileirar(db(), {
    ...base,
    tipo: "ml.anuncios",
    chaveUnica: `ml.anuncios:${conta.id}:${bloco}`,
    payload: { contaId: conta.id },
  });
  // Pedidos novos e pedidos que mudaram (cancelamento, devolução) nas últimas 48 h.
  const agora = new Date();
  await enfileirar(db(), {
    ...base,
    tipo: "ml.pedidos",
    chaveUnica: `ml.pedidos:${conta.id}:${bloco}`,
    payload: {
      contaId: conta.id,
      campo: "date_last_updated",
      de: new Date(agora.getTime() - 2 * 864e5).toISOString(),
      ate: agora.toISOString(),
      conferencia: `ml.pedidos.${bloco}`,
    } satisfies PayloadPedidos,
  });
}
