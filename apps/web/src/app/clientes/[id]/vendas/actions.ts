"use server";

import { clientes, db } from "@banah/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdmin } from "@/lib/sessao";

export async function salvarImposto(form: FormData) {
  await exigirAdmin();
  const clienteId = String(form.get("clienteId") ?? "");
  const destino = `/clientes/${clienteId}/vendas`;
  const cliente = await db().query.clientes.findFirst({ where: eq(clientes.id, clienteId) });
  if (!cliente) redirect("/");

  const texto = String(form.get("aliquotaImpostoPct") ?? "")
    .replace("%", "")
    .replace(",", ".")
    .trim();
  const valor = texto === "" ? null : Number(texto);
  if (valor !== null && (!Number.isFinite(valor) || valor < 0 || valor > 50)) {
    redirect(
      `${destino}?msg=${encodeURIComponent("Alíquota inválida: use um número entre 0 e 50.")}`,
    );
  }

  const config = {
    ...((cliente.config ?? {}) as Record<string, unknown>),
    aliquotaImpostoPct: valor,
  };
  await db()
    .update(clientes)
    .set({ config, atualizadoEm: new Date() })
    .where(eq(clientes.id, clienteId));
  revalidatePath(destino);
  redirect(`${destino}?msg=${encodeURIComponent("Alíquota salva.")}`);
}
