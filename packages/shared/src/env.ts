/**
 * Leitura de variáveis de ambiente com erro claro quando falta alguma.
 * Nunca ler process.env espalhado pelo código: sempre por aqui.
 */
export type AppEnv = "local" | "staging" | "production";

export function exigir(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new Error(`Variável de ambiente ausente: ${nome}`);
  return valor;
}

export function opcional(nome: string, padrao = ""): string {
  return process.env[nome] ?? padrao;
}

export function appEnv(): AppEnv {
  const v = opcional("APP_ENV", "local");
  if (v !== "local" && v !== "staging" && v !== "production") {
    throw new Error(`APP_ENV inválido: ${v}`);
  }
  return v;
}

/** Fora de produção os agentes SEMPRE rodam em modo seco, mesmo que a variável diga o contrário. */
export function agentesEmModoSeco(): boolean {
  if (appEnv() !== "production") return true;
  return opcional("AGENTS_DRY_RUN", "true") !== "false";
}
