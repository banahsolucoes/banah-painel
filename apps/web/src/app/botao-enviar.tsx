"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * Botão de formulário que trava enquanto envia (evita cadastro repetido)
 * e, se `confirmar` vier preenchido, pede confirmação antes.
 */
export function BotaoEnviar({
  children,
  enviando = "Salvando…",
  confirmar,
  secundario = false,
}: {
  children: ReactNode;
  enviando?: string;
  confirmar?: string;
  secundario?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={secundario ? "botao secundario" : undefined}
      onClick={(e) => {
        if (confirmar && !window.confirm(confirmar)) e.preventDefault();
      }}
    >
      {pending ? enviando : children}
    </button>
  );
}
