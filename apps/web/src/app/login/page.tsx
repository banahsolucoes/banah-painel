"use client";

import { useActionState } from "react";
import { entrar } from "../actions";

export default function Login() {
  const [mensagem, enviar, enviando] = useActionState(entrar, null);
  return (
    <main style={{ maxWidth: 440 }}>
      <h1>Painel BANAH</h1>
      <p className="suave">Entre com seu e-mail. Enviamos um link de acesso, sem senha.</p>
      <form action={enviar} className="cartao" style={{ display: "grid", gap: 12 }}>
        <input
          type="email"
          name="email"
          placeholder="seu@email.com"
          required
          autoComplete="email"
        />
        <button type="submit" disabled={enviando}>
          {enviando ? "Enviando…" : "Receber link de acesso"}
        </button>
        {mensagem && <p className="suave">{mensagem}</p>}
      </form>
    </main>
  );
}
