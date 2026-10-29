/**
 * Leitura da tabela de custos colada da planilha do cliente.
 * Aceita colunas separadas por TAB (copiar do Google Sheets/Excel) ou ";".
 * Procura no cabeçalho as colunas "SKU" e "Custo" (ex.: "Valor de Custo").
 */

export type LinhaCusto = { sku: string; custoCentavos: number };
export type ResultadoCustos = {
  linhas: LinhaCusto[];
  ignoradas: { linha: number; texto: string; motivo: string }[];
};

/** "R$ 1.234,56" | "23,00" | "23.5" → centavos. null se não for número. */
export function lerValorReais(texto: string): number | null {
  let t = texto.replace(/R\$/i, "").replace(/\s/g, "").trim();
  if (t === "") return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const [inteiro = "0", frac = ""] = t.replace("-", "").split(".");
  const valor = Number(inteiro) * 100 + Number(frac.padEnd(2, "0").slice(0, 2));
  return t.startsWith("-") ? -valor : valor;
}

const SEM_SKU = /^\(?sem sku\)?$/i;

export function lerTabelaCustos(texto: string): ResultadoCustos {
  const linhasTexto = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  const resultado: ResultadoCustos = { linhas: [], ignoradas: [] };
  if (linhasTexto.length === 0) return resultado;

  const separador = linhasTexto[0]?.includes("\t") ? "\t" : ";";
  const cabecalho = (linhasTexto[0] ?? "").split(separador).map((c) => c.trim().toLowerCase());
  const iSku = cabecalho.findIndex((c) => c === "sku" || c.includes("sku"));
  const iCusto = cabecalho.findIndex((c) => c.includes("custo"));
  if (iSku < 0 || iCusto < 0) {
    resultado.ignoradas.push({
      linha: 1,
      texto: linhasTexto[0] ?? "",
      motivo: "cabeçalho sem as colunas SKU e Custo",
    });
    return resultado;
  }

  const vistos = new Map<string, number>();
  linhasTexto.slice(1).forEach((linha, i) => {
    const n = i + 2;
    const colunas = linha.split(separador);
    const sku = (colunas[iSku] ?? "").trim();
    const custoTexto = (colunas[iCusto] ?? "").trim();
    if (!sku || SEM_SKU.test(sku)) {
      resultado.ignoradas.push({ linha: n, texto: linha, motivo: "sem SKU" });
      return;
    }
    const custo = lerValorReais(custoTexto);
    if (custo === null) {
      resultado.ignoradas.push({ linha: n, texto: linha, motivo: "sem custo" });
      return;
    }
    if (custo <= 0) {
      resultado.ignoradas.push({ linha: n, texto: linha, motivo: "custo zero ou negativo" });
      return;
    }
    // SKU repetido: vale a última linha.
    const anterior = vistos.get(sku);
    if (anterior !== undefined) resultado.linhas.splice(anterior, 1, { sku, custoCentavos: custo });
    else {
      vistos.set(sku, resultado.linhas.length);
      resultado.linhas.push({ sku, custoCentavos: custo });
    }
  });
  return resultado;
}
