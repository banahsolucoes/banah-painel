/**
 * A operação é em São Paulo. Datas de negócio (dia da venda, foto diária do estoque)
 * são sempre calculadas no fuso America/Sao_Paulo, nunca no UTC do servidor.
 */
export const FUSO = "America/Sao_Paulo";

/** "2026-10-29" no fuso de São Paulo. */
export function diaLocal(data: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(data);
}

export function somarDias(dia: string, dias: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function diasEntre(inicio: string, fim: string): number {
  return Math.round((Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 864e5);
}
