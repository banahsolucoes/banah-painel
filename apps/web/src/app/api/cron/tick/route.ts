import { contasCanal, db } from "@banah/db";
import { enfileirar, executarLote } from "@banah/jobs";
import { diaLocal, exigir, log } from "@banah/shared";
import { eq } from "drizzle-orm";
import { handlers } from "@/lib/handlers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Chamado pelo Vercel Cron a cada 5 minutos (vercel.json).
 * 1) agenda as tarefas diárias (idempotente: a chave inclui o dia);
 * 2) executa um lote da fila.
 */
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${exigir("CRON_SECRET")}`) {
    return new Response("não autorizado", { status: 401 });
  }

  const hoje = diaLocal();
  const contas = await db().select().from(contasCanal).where(eq(contasCanal.canal, "MELI"));
  for (const c of contas) {
    if (c.status === "revogada") continue;
    await enfileirar(db(), {
      clienteId: c.clienteId,
      tipo: "ml.verificar_token",
      chaveUnica: `ml.verificar_token:${c.id}:${hoje}`,
      payload: { contaId: c.id },
    });
  }

  const resultado = await executarLote(db(), handlers, { limite: 10, tempoMaxMs: 240_000 });
  log.info("cron tick", resultado);
  return Response.json(resultado);
}
