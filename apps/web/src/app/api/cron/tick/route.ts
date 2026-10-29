import { contasCanal, db } from "@banah/db";
import { executarLote } from "@banah/jobs";
import { exigir, log } from "@banah/shared";
import { eq } from "drizzle-orm";
import { agendarConta, handlers } from "@/lib/handlers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Chamado pelo agendador (Vercel Cron em produção, GitHub no staging).
 * 1) agenda as tarefas recorrentes de cada conta (idempotente);
 * 2) executa um lote da fila.
 */
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${exigir("CRON_SECRET")}`) {
    return new Response("não autorizado", { status: 401 });
  }

  const contas = await db().select().from(contasCanal).where(eq(contasCanal.canal, "MELI"));
  for (const c of contas) {
    if (c.status === "revogada") continue;
    await agendarConta(c);
  }

  const resultado = await executarLote(db(), handlers, { limite: 10, tempoMaxMs: 240_000 });
  log.info("cron tick", resultado);
  return Response.json(resultado);
}
