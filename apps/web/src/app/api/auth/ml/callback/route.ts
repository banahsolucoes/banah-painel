import { camposDoToken, mlGet, trocarCodigo } from "@banah/connector-ml";
import { contasCanal, db } from "@banah/db";
import { enfileirar } from "@banah/jobs";
import { diaLocal, log } from "@banah/shared";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { chaveTokens, mlApp } from "@/lib/config";
import { exigirAdmin } from "@/lib/sessao";

export const dynamic = "force-dynamic";

function voltar(request: Request, msg: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("msg", msg);
  return Response.redirect(url, 302);
}

/** Retorno do ML depois que o vendedor autoriza o app BANAH. */
export async function GET(request: Request) {
  await exigirAdmin();
  const params = new URL(request.url).searchParams;
  const loja = await cookies();
  const estado = loja.get("ml_estado")?.value;
  const verificador = loja.get("ml_pkce")?.value;
  const clienteId = loja.get("ml_cliente")?.value;
  for (const n of ["ml_estado", "ml_pkce", "ml_cliente"])
    loja.delete({ name: n, path: "/api/auth/ml" });

  if (params.get("error"))
    return voltar(request, `O Mercado Livre recusou: ${params.get("error")}`);
  const codigo = params.get("code");
  if (!codigo || !estado || !verificador || !clienteId || params.get("state") !== estado) {
    return voltar(request, "Conexão expirada ou inválida. Tente de novo.");
  }

  const token = await trocarCodigo(mlApp(), codigo, verificador);
  const eu = await mlGet<{ id: number; nickname: string }>(token.access_token, "/users/me");
  const sellerId = String(eu.id);

  const outro = await db().query.contasCanal.findFirst({
    where: and(eq(contasCanal.canal, "MELI"), eq(contasCanal.sellerId, sellerId)),
  });
  if (outro && outro.clienteId !== clienteId) {
    return voltar(request, `A conta ${eu.nickname} já está ligada a outro cliente.`);
  }

  const campos = {
    ...camposDoToken(token, chaveTokens()),
    apelido: eu.nickname,
    status: "ativa" as const,
    ultimoErro: null,
  };
  const [conta] = await db()
    .insert(contasCanal)
    .values({ clienteId, canal: "MELI", sellerId, ...campos })
    .onConflictDoUpdate({
      target: [contasCanal.canal, contasCanal.sellerId],
      set: { ...campos, atualizadoEm: new Date() },
    })
    .returning({ id: contasCanal.id });

  if (conta) {
    await enfileirar(db(), {
      clienteId,
      tipo: "ml.verificar_token",
      chaveUnica: `ml.verificar_token:${conta.id}:${diaLocal()}`,
      payload: { contaId: conta.id },
    });
  }
  log.info("conta ML conectada", { clienteId, sellerId });
  return voltar(request, `Conta ${eu.nickname} conectada.`);
}
