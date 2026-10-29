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
