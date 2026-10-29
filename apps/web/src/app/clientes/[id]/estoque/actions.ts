"use server";

import { clientes, db } from "@banah/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { configEstoque } from "@/lib/estoque";
import { exigirAdmin } from "@/lib/sessao";

function inteiro(v: FormDataEntryValue | null, min: number): number | null {
  const texto = String(v ?? "").trim();
  if (texto === "") return null;
  const n = Number(texto);
  return Number.isInteger(n) && n >= min ? n : null;
}

export async function salvarConfigEstoque(form: FormData) {
  await exigirAdmin();
  const clienteId = String(form.get("clienteId") ?? "");
  const cliente = await db().query.clientes.findFirst({ where: eq(clientes.id, clienteId) });
  if (!cliente) redirect("/");

  const atual = configEstoque(cliente.config);
  const novo = {
    ...((cliente.config ?? {}) as Record<string, unknown>),
    prazoReposicaoDias: inteiro(form.get("prazoReposicaoDias"), 1) ?? atual.prazoReposicaoDias,
    segurancaDias: inteiro(form.get("segurancaDias"), 0) ?? atual.segurancaDias,
    capacidadeFullMl: inteiro(form.get("capacidadeFullMl"), 0),
  };
  await db()
    .update(clientes)
    .set({ config: novo, atualizadoEm: new Date() })
    .where(eq(clientes.id, clienteId));

  const destino = `/clientes/${clienteId}/estoque`;
  revalidatePath(destino);
  redirect(`${destino}?msg=${encodeURIComponent("Parâmetros salvos.")}`);
}
