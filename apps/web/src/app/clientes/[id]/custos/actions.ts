"use server";

import { lerTabelaCustos } from "@banah/core";
import { clientes, db, produtosCusto } from "@banah/db";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdmin } from "@/lib/sessao";

export async function importarCustos(form: FormData) {
  await exigirAdmin();
  const clienteId = String(form.get("clienteId") ?? "");
  const destino = `/clientes/${clienteId}/custos`;
  const cliente = await db().query.clientes.findFirst({ where: eq(clientes.id, clienteId) });
  if (!cliente) redirect("/");

  const r = lerTabelaCustos(String(form.get("tabela") ?? ""));
  if (r.linhas.length === 0) {
    const motivo = r.ignoradas[0]?.motivo ?? "tabela vazia";
    redirect(`${destino}?msg=${encodeURIComponent(`Nada importado: ${motivo}.`)}`);
  }

  for (let i = 0; i < r.linhas.length; i += 200) {
    await db()
      .insert(produtosCusto)
      .values(
        r.linhas.slice(i, i + 200).map((l) => ({
          clienteId,
          sku: l.sku,
          custoCentavos: l.custoCentavos,
          origem: "planilha",
        })),
      )
      .onConflictDoUpdate({
        target: [produtosCusto.clienteId, produtosCusto.sku],
        set: {
          custoCentavos: sql.raw("excluded.custo_centavos"),
          origem: "planilha",
          atualizadoEm: sql`now()`,
        },
      });
  }

  const resumo = `${r.linhas.length} custos importados${
    r.ignoradas.length
      ? `, ${r.ignoradas.length} linha(s) ignorada(s) (${r.ignoradas.map((i) => `linha ${i.linha}: ${i.motivo}`).join("; ")})`
      : ""
  }.`;
  revalidatePath(destino);
  redirect(`${destino}?msg=${encodeURIComponent(resumo)}`);
}
