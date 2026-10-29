"use server";

import { clientes, contasCanal, db } from "@banah/db";
import { opcional } from "@banah/shared";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdmin } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase";

function voltarCom(msg: string): never {
  revalidatePath("/");
  redirect(`/?msg=${encodeURIComponent(msg)}`);
}

export async function criarCliente(form: FormData) {
  await exigirAdmin();
  const nome = String(form.get("nome") ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (nome.length < 2) voltarCom("Informe o nome da empresa.");

  // Recusa nome repetido, ignorando maiúsculas e espaços.
  const existente = await db()
    .select({ id: clientes.id })
    .from(clientes)
    .where(sql`lower(${clientes.nome}) = lower(${nome})`)
    .limit(1);
  if (existente.length > 0) voltarCom(`Já existe um cliente chamado ${nome}.`);

  await db().insert(clientes).values({ nome });
  voltarCom(`Cliente ${nome} cadastrado.`);
}

/** Só exclui cliente sem nenhuma conta conectada, para nunca apagar dado real por engano. */
export async function excluirCliente(form: FormData) {
  await exigirAdmin();
  const id = String(form.get("id") ?? "");
  const contas = await db()
    .select({ id: contasCanal.id })
    .from(contasCanal)
    .where(eq(contasCanal.clienteId, id))
    .limit(1);
  if (contas.length > 0) voltarCom("Esse cliente tem conta conectada e não pode ser excluído.");

  const [apagado] = await db()
    .delete(clientes)
    .where(eq(clientes.id, id))
    .returning({ nome: clientes.nome });
  voltarCom(apagado ? `Cliente ${apagado.nome} excluído.` : "Cliente não encontrado.");
}

export async function entrar(_: string | null, form: FormData): Promise<string> {
  const email = String(form.get("email") ?? "").trim();
  if (!email.includes("@")) return "Informe um e-mail válido.";
  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${opcional("APP_URL", "http://localhost:3000")}/auth/callback` },
  });
  return error
    ? `Não foi possível enviar: ${error.message}`
    : "Enviamos um link de acesso para o seu e-mail.";
}

export async function sair() {
  const supabase = await supabaseServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
