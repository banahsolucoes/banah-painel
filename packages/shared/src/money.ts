/**
 * Dinheiro sempre em centavos inteiros. Nunca usar number decimal para valor.
 * O tipo "marcado" impede somar centavos com um número qualquer por engano.
 */
export type Centavos = number & { readonly __brand: "Centavos" };

export function centavos(valor: number): Centavos {
  if (!Number.isInteger(valor)) {
    throw new Error(`Centavos deve ser inteiro, recebido: ${valor}`);
  }
  return valor as Centavos;
}

/**
 * Converte o valor em reais que as APIs devolvem (ex.: 31.48) para centavos,
 * sem erro de ponto flutuante (31.48 * 100 = 3147.9999…).
 */
export function deReais(reais: number | string): Centavos {
  const texto = typeof reais === "number" ? reais.toFixed(2) : reais.trim().replace(",", ".");
  const negativo = texto.startsWith("-");
  const [inteiro = "0", frac = ""] = texto.replace("-", "").split(".");
  const valor = Number(inteiro) * 100 + Number(frac.padEnd(2, "0").slice(0, 2));
  if (!Number.isFinite(valor)) throw new Error(`Valor inválido: ${reais}`);
  return centavos(negativo ? -valor : valor);
}

export function somar(...valores: Centavos[]): Centavos {
  return centavos(valores.reduce<number>((acc, v) => acc + v, 0));
}

/** Formata para exibição: 314798 → "R$ 3.147,98". */
export function formatarReais(valor: Centavos): string {
  return (valor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
