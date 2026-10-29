import { randomBytes } from "node:crypto";
import { gerarPkce, urlDeAutorizacao } from "@banah/connector-ml";
import { clientes, db } from "@banah/db";
import { appEnv } from "@banah/shared";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { mlApp } from "@/lib/config";
import { exigirAdmin } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** Início da conexão: /api/auth/ml/start?cliente=<id>. Só admin. */
export async function GET(request: Request) {
  await exigirAdmin();
  const clienteId = new URL(request.url).searchParams.get("cliente");
  if (!clienteId) return new Response("informe ?cliente=<id>", { status: 400 });

  const cliente = await db().query.clientes.findFirst({ where: eq(clientes.id, clienteId) });
  if (!cliente) return new Response("cliente não encontrado", { status: 404 });

  const estado = randomBytes(24).toString("base64url");
  const { verificador, desafio } = gerarPkce();

  const loja = await cookies();
  const opcoes = {
    httpOnly: true,
    secure: appEnv() !== "local",
    sameSite: "lax" as const,
    path: "/api/auth/ml",
    maxAge: 600,
  };
  loja.set("ml_estado", estado, opcoes);
  loja.set("ml_pkce", verificador, opcoes);
  loja.set("ml_cliente", clienteId, opcoes);

  return Response.redirect(urlDeAutorizacao(mlApp(), estado, desafio), 302);
}
