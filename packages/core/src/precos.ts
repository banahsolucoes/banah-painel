/** Queda de preço acima disso pede confirmação extra (proteção contra erro de digitação). */
export const QUEDA_QUE_PEDE_CONFIRMACAO_PCT = 30;
/** Subida acima disso também pede confirmação (ex.: digitou 2390 em vez de 23,90). */
export const ALTA_QUE_PEDE_CONFIRMACAO_PCT = 100;

export type ChecagemPreco =
  | { ok: true; variacaoPct: number }
  | { ok: false; motivo: string; precisaConfirmar: boolean };

/** Valida a troca de preço antes de mandar ao canal. Valores em centavos. */
export function checarNovoPreco(
  atualCentavos: number,
  novoCentavos: number | null,
  confirmado: boolean,
): ChecagemPreco {
  if (novoCentavos === null)
    return { ok: false, motivo: "Preço inválido.", precisaConfirmar: false };
  if (novoCentavos <= 0)
    return { ok: false, motivo: "O preço precisa ser maior que zero.", precisaConfirmar: false };
  if (novoCentavos === atualCentavos)
    return { ok: false, motivo: "O preço novo é igual ao atual.", precisaConfirmar: false };
  const variacaoPct =
    atualCentavos > 0 ? ((novoCentavos - atualCentavos) / atualCentavos) * 100 : 0;
  const grande =
    variacaoPct <= -QUEDA_QUE_PEDE_CONFIRMACAO_PCT || variacaoPct >= ALTA_QUE_PEDE_CONFIRMACAO_PCT;
  if (grande && !confirmado) {
    return {
      ok: false,
      motivo: `Mudança de ${variacaoPct.toFixed(0)}% no preço. Marque "confirmo" para aplicar.`,
      precisaConfirmar: true,
    };
  }
  return { ok: true, variacaoPct };
}

export type Recebimento = {
  /** Comprador paga − tarifa do ML − frete pago pelo vendedor. */
  recebeCentavos: number | null;
  /** Recebe − custo − imposto. null sem custo ou sem alíquota. */
  margemCentavos: number | null;
  margemPct: number | null;
};

/** Quanto entra no bolso por venda de 1 unidade. Valores em centavos. */
export function calcularRecebimento(p: {
  precoVendaCentavos: number;
  tarifaCentavos: number | null;
  freteCentavos: number | null;
  custoCentavos: number | null;
  impostoPct: number | null;
}): Recebimento {
  if (p.tarifaCentavos === null || p.freteCentavos === null) {
    return { recebeCentavos: null, margemCentavos: null, margemPct: null };
  }
  const recebe = p.precoVendaCentavos - p.tarifaCentavos - p.freteCentavos;
  if (p.custoCentavos === null || p.impostoPct === null) {
    return { recebeCentavos: recebe, margemCentavos: null, margemPct: null };
  }
  const imposto = Math.round((p.precoVendaCentavos * p.impostoPct) / 100);
  const margem = recebe - p.custoCentavos - imposto;
  return {
    recebeCentavos: recebe,
    margemCentavos: margem,
    margemPct: p.precoVendaCentavos > 0 ? (margem / p.precoVendaCentavos) * 100 : null,
  };
}

const TIPOS: Record<string, string> = {
  gold_special: "Clássico",
  gold_pro: "Premium",
  gold_premium: "Diamante",
  free: "Grátis",
};
export const nomeTipoAnuncio = (t: string | null | undefined) => (t ? (TIPOS[t] ?? t) : "—");
