/** Corta o texto em `max` caracteres (sem quebrar palavra no meio, quando dá). */
export function curto(texto: string | null | undefined, max = 60): string {
  const t = (texto ?? "").trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const espaco = corte.lastIndexOf(" ");
  return `${(espaco > max * 0.6 ? corte.slice(0, espaco) : corte).trimEnd()}…`;
}
