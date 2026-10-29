import { db } from "@banah/db";
import { appEnv } from "@banah/shared";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Saúde do sistema (não da conta do cliente). Chamado pela esteira depois de cada deploy.
 * Responde 503 se o banco não responde ou se há conta com token em erro.
 */
export async function GET() {
  try {
    const [r] = await db().execute(sql`
      select
        (select count(*) from jobs where status = 'pendente')::int as pendentes,
        (select count(*) from jobs where status = 'falhou')::int as falhas,
        (select count(*) from contas_canal where status = 'erro')::int as contas_em_erro
    `);
    const linha = r as { pendentes: number; falhas: number; contas_em_erro: number };
    const ok = linha.contas_em_erro === 0;
    return Response.json(
      {
        ok,
        ambiente: appEnv(),
        banco: "ok",
        fila: { pendentes: linha.pendentes, falhas: linha.falhas },
        contasEmErro: linha.contas_em_erro,
      },
      { status: ok ? 200 : 503 },
    );
  } catch (erro) {
    return Response.json(
      { ok: false, banco: "erro", detalhe: erro instanceof Error ? erro.message : String(erro) },
      { status: 503 },
    );
  }
}
