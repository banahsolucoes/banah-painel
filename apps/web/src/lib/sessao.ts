import { db, usuarios } from "@banah/db";
import { opcional } from "@banah/shared";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { supabaseServidor } from "./supabase";

export type Sessao = {
  id: string;
  email: string;
  papel: "admin" | "equipe" | "dono";
  clienteId: string | null;
};

function emailsAdmin(): string[] {
  return opcional("ADMIN_EMAILS")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Usuário logado com seu papel. No primeiro login cria o registro em `usuarios`:
 * e-mail listado em ADMIN_EMAILS vira admin; qualquer outro vira dono sem cliente
 * (não enxerga nada até Israel ligá-lo a um cliente).
 */
export async function sessaoAtual(): Promise<Sessao | null> {
  const supabase = await supabaseServidor();
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  if (!u?.email) return null;

  const email = u.email.toLowerCase();
  const existente = await db().query.usuarios.findFirst({ where: eq(usuarios.id, u.id) });
  if (existente) {
    return { id: u.id, email, papel: existente.papel, clienteId: existente.clienteId };
  }

  const papel = emailsAdmin().includes(email) ? "admin" : "dono";
  await db().insert(usuarios).values({ id: u.id, email, papel }).onConflictDoNothing();
  return { id: u.id, email, papel, clienteId: null };
}

export async function exigirAdmin(): Promise<Sessao> {
  const s = await sessaoAtual();
  if (!s) redirect("/login");
  if (s.papel !== "admin") throw new Error("Acesso restrito à equipe BANAH");
  return s;
}
