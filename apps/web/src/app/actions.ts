"use server";

import { clientes, db } from "@banah/db";
import { opcional } from "@banah/shared";
import { revalidatePath } from "next/cache";
import { exigirAdmin } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase";

export async function criarCliente(form: FormData) {
  await exigirAdmin();
  const nome = String(form.get("nome") ?? "").trim();
  if (nome.length < 2) return;
  await db().insert(clientes).values({ nome });
  revalidatePath("/");
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
  revalidatePath("/");
}
