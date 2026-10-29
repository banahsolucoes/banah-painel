/**
 * Camada 6 — Estoque e previsão 60 dias.
 * Funções puras: recebem números, devolvem números. Sem banco, sem API.
 */

export const HORIZONTE_DIAS = 60;
export const AMOSTRA_MINIMA_DIAS = 30;
export const AMOSTRA_NORMAL_DIAS = 60;
export const EXCESSO_DIAS = 120;
export const PARADO_DIAS = 30;

/** Peso de cada janela na média: o recente pesa mais. */
const JANELAS = [
  { dias: 7, peso: 0.5 },
  { dias: 30, peso: 0.3 },
  { dias: 60, peso: 0.2 },
] as const;

export type Confianca = "coletando" | "baixa" | "normal";
export type StatusEstoque =
  | "ruptura_iminente"
  | "comprar"
  | "ok"
  | "excesso"
  | "parado"
  | "sem_dados";

export type EntradaEstoque = {
  /** Unidades vendidas por dia, do mais antigo ao mais recente. Dia sem venda = 0. */
  vendasDiarias: number[];
  /** Estoque disponível agora (somado entre os locais considerados). */
  disponivel: number;
  /** Unidades já compradas que ainda não chegaram. */
  emTransito?: number;
  /** Dias entre pedir ao fornecedor e o estoque estar disponível para venda. */
  prazoReposicaoDias: number;
  /** Folga, em dias de venda, para variação de demanda e atraso. */
  segurancaDias?: number;
  /** Teto do local (ex.: espaço no Full). Limita a sugestão de compra. */
  capacidadeMax?: number;
};

export type ResultadoEstoque = {
  diasHistorico: number;
  confianca: Confianca;
  vendaMediaDiaria: number;
  /** null quando não há venda (estoque não acaba). */
  coberturaDias: number | null;
  /** null enquanto a amostragem for menor que 30 dias. */
  previsao60d: number | null;
  pontoReposicao: number | null;
  sugestaoCompra: number | null;
  status: StatusEstoque;
};

function mediaDaJanela(vendas: number[], dias: number): number {
  const recorte = vendas.slice(-dias);
  if (recorte.length === 0) return 0;
  return recorte.reduce((a, b) => a + b, 0) / recorte.length;
}

/** Média ponderada das janelas disponíveis; janelas maiores que o histórico ficam de fora. */
export function vendaMediaPonderada(vendas: number[]): number {
  const usaveis = JANELAS.filter((j, i) => i === 0 || vendas.length >= j.dias);
  const pesoTotal = usaveis.reduce((a, j) => a + j.peso, 0);
  if (vendas.length === 0 || pesoTotal === 0) return 0;
  return usaveis.reduce((a, j) => a + mediaDaJanela(vendas, j.dias) * j.peso, 0) / pesoTotal;
}

export function confiancaDaAmostra(diasHistorico: number): Confianca {
  if (diasHistorico < AMOSTRA_MINIMA_DIAS) return "coletando";
  if (diasHistorico < AMOSTRA_NORMAL_DIAS) return "baixa";
  return "normal";
}

export function analisarEstoque(e: EntradaEstoque): ResultadoEstoque {
  const diasHistorico = e.vendasDiarias.length;
  const confianca = confiancaDaAmostra(diasHistorico);
  const media = vendaMediaPonderada(e.vendasDiarias);
  const transito = e.emTransito ?? 0;
  const segurancaDias = e.segurancaDias ?? 7;
  const cobertura = media > 0 ? e.disponivel / media : null;

  if (diasHistorico === 0) {
    return {
      diasHistorico,
      confianca,
      vendaMediaDiaria: 0,
      coberturaDias: null,
      previsao60d: null,
      pontoReposicao: null,
      sugestaoCompra: null,
      status: "sem_dados",
    };
  }

  const vendeuNoPeriodoParado = e.vendasDiarias.slice(-PARADO_DIAS).some((v) => v > 0);
  const temAmostra = confianca !== "coletando";

  const previsao = temAmostra ? Math.ceil(media * HORIZONTE_DIAS) : null;
  const ponto = temAmostra ? Math.ceil(media * (e.prazoReposicaoDias + segurancaDias)) : null;

  let sugestao: number | null = null;
  if (previsao !== null) {
    const seguranca = Math.ceil(media * segurancaDias);
    let s = Math.max(0, previsao + seguranca - e.disponivel - transito);
    if (e.capacidadeMax !== undefined)
      s = Math.min(s, Math.max(0, e.capacidadeMax - e.disponivel - transito));
    sugestao = s;
  }

  let status: StatusEstoque;
  if (diasHistorico >= PARADO_DIAS && !vendeuNoPeriodoParado) status = "parado";
  else if (cobertura !== null && cobertura < e.prazoReposicaoDias) status = "ruptura_iminente";
  else if (ponto !== null && e.disponivel + transito <= ponto) status = "comprar";
  else if (cobertura !== null && cobertura > EXCESSO_DIAS) status = "excesso";
  else status = "ok";

  return {
    diasHistorico,
    confianca,
    vendaMediaDiaria: media,
    coberturaDias: cobertura,
    previsao60d: previsao,
    pontoReposicao: ponto,
    sugestaoCompra: sugestao,
    status,
  };
}

/**
 * Kit montado internamente: a demanda do kit vira demanda de cada componente.
 * Ex.: 10 kits com 4 parafusos e 4 porcas = 40 parafusos e 40 porcas.
 */
export function desdobrarKits(
  demandaPorKit: Record<string, number>,
  composicao: Record<string, { componente: string; quantidade: number }[]>,
): Record<string, number> {
  const total: Record<string, number> = {};
  for (const [kit, unidades] of Object.entries(demandaPorKit)) {
    for (const c of composicao[kit] ?? []) {
      total[c.componente] = (total[c.componente] ?? 0) + unidades * c.quantidade;
    }
  }
  return total;
}
