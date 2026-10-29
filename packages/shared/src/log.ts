/**
 * Log estruturado em JSON (o Vercel indexa por campo). Nunca logar token ou segredo.
 */
type Nivel = "info" | "warn" | "error";

const PROIBIDOS = /token|secret|senha|password|authorization/i;

function limpar(dados: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(dados).map(([k, v]) => [k, PROIBIDOS.test(k) ? "[omitido]" : v]),
  );
}

function escrever(nivel: Nivel, msg: string, dados: Record<string, unknown> = {}) {
  const linha = JSON.stringify({ nivel, msg, em: new Date().toISOString(), ...limpar(dados) });
  if (nivel === "error") console.error(linha);
  else if (nivel === "warn") console.warn(linha);
  else console.log(linha);
}

export const log = {
  info: (msg: string, dados?: Record<string, unknown>) => escrever("info", msg, dados),
  warn: (msg: string, dados?: Record<string, unknown>) => escrever("warn", msg, dados),
  error: (msg: string, dados?: Record<string, unknown>) => escrever("error", msg, dados),
};
