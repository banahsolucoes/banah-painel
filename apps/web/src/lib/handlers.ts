import { mlGet, obterAccessToken } from "@banah/connector-ml";
import { contasCanal, db } from "@banah/db";
import type { Handler } from "@banah/jobs";
import { log } from "@banah/shared";
import { eq } from "drizzle-orm";
import { chaveTokens, mlApp } from "./config";

/**
 * Tarefas que o executor sabe rodar. Cada fase acrescenta as suas aqui.
 * Fase 0: conferir que o token de cada conta ML continua válido e renovando sozinho.
 */
export const handlers: Record<string, Handler> = {
  "ml.verificar_token": async (job) => {
    const { contaId } = job.payload as { contaId: string };
    const token = await obterAccessToken(db(), contaId, mlApp(), chaveTokens());
    const eu = await mlGet<{ id: number; nickname: string }>(token, "/users/me");
    await db()
      .update(contasCanal)
      .set({ apelido: eu.nickname, atualizadoEm: new Date() })
      .where(eq(contasCanal.id, contaId));
    log.info("token ML conferido", { contaId, sellerId: eu.id });
  },
};
