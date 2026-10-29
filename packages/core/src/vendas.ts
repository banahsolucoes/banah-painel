/**
 * Indicadores do dashboard de vendas. Funções puras sobre valores em centavos.
 *
 * Receita líquida = faturamento − tarifas de venda − frete pago pelo vendedor
 * Margem         = receita líquida − custo dos produtos − imposto − ads
 */

export type BaseVendas = {
  faturamentoCentavos: number;
  pedidos: number;
  unidades: number;
  tarifasCentavos: number;
  freteCentavos: number;
  custoCentavos: number;
  /** Alíquota média de imposto sobre o faturamento, em % (ex.: 9.25). null = não configurada. */
  impostoPct: number | null;
  adsCustoCentavos: number;
  adsReceitaCentavos: number;
  adsCliques: number;
  adsImpressoes: number;
};

export type Indicadores = {
  faturamentoCentavos: number;
  pedidos: number;
  unidades: number;
  ticketMedioCentavos: number | null;
  receitaLiquidaCentavos: number;
  impostoCentavos: number | null;
  margemCentavos: number | null;
  margemPct: number | null;
  adsCustoCentavos: number;
  adsReceitaCentavos: number;
  cpcCentavos: number | null;
  /** ROAS = receita atribuída ao ads ÷ gasto (ex.: 8 = 8x) */
  roas: number | null;
  /** ACOS = gasto ÷ receita atribuída ao ads, em % */
  acosPct: number | null;
  /** TACOS = gasto ÷ faturamento total da conta, em % */
  tacosPct: number | null;
  ctrPct: number | null;
};

const div = (a: number, b: number) => (b > 0 ? a / b : null);

export function calcularIndicadores(b: BaseVendas): Indicadores {
  const receitaLiquida = b.faturamentoCentavos - b.tarifasCentavos - b.freteCentavos;
  const imposto =
    b.impostoPct === null ? null : Math.round((b.faturamentoCentavos * b.impostoPct) / 100);
  const margem =
    imposto === null ? null : receitaLiquida - b.custoCentavos - imposto - b.adsCustoCentavos;
  const pct = (v: number | null) => (v === null ? null : v * 100);

  return {
    faturamentoCentavos: b.faturamentoCentavos,
    pedidos: b.pedidos,
    unidades: b.unidades,
    ticketMedioCentavos: b.pedidos > 0 ? Math.round(b.faturamentoCentavos / b.pedidos) : null,
    receitaLiquidaCentavos: receitaLiquida,
    impostoCentavos: imposto,
    margemCentavos: margem,
    margemPct: margem === null ? null : pct(div(margem, b.faturamentoCentavos)),
    adsCustoCentavos: b.adsCustoCentavos,
    adsReceitaCentavos: b.adsReceitaCentavos,
    cpcCentavos: b.adsCliques > 0 ? Math.round(b.adsCustoCentavos / b.adsCliques) : null,
    roas: div(b.adsReceitaCentavos, b.adsCustoCentavos),
    acosPct: pct(div(b.adsCustoCentavos, b.adsReceitaCentavos)),
    tacosPct: pct(div(b.adsCustoCentavos, b.faturamentoCentavos)),
    ctrPct: pct(div(b.adsCliques, b.adsImpressoes)),
  };
}

/** Rótulo e cor da reputação do ML a partir do level_id ("5_green" etc.). */
export function lerNivelReputacao(nivel: string | null): { rotulo: string; cor: string } {
  const mapa: Record<string, { rotulo: string; cor: string }> = {
    "5_green": { rotulo: "Verde", cor: "ok" },
    "4_light_green": { rotulo: "Verde-claro", cor: "ok" },
    "3_yellow": { rotulo: "Amarelo", cor: "alerta" },
    "2_orange": { rotulo: "Laranja", cor: "alerta" },
    "1_red": { rotulo: "Vermelho", cor: "erro" },
  };
  return (nivel && mapa[nivel]) || { rotulo: "Sem termômetro", cor: "neutro" };
}
