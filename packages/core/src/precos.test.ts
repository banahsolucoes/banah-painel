import { describe, expect, it } from "vitest";
import { checarNovoPreco } from "./precos";

describe("checarNovoPreco", () => {
  it("aceita mudança pequena", () => {
    expect(checarNovoPreco(10_000, 9_500, false)).toEqual({ ok: true, variacaoPct: -5 });
  });
  it("recusa zero, inválido e igual", () => {
    expect(checarNovoPreco(10_000, 0, true).ok).toBe(false);
    expect(checarNovoPreco(10_000, null, true).ok).toBe(false);
    expect(checarNovoPreco(10_000, 10_000, true).ok).toBe(false);
  });
  it("pede confirmação em queda de 30% ou mais e em alta de 100% ou mais", () => {
    const queda = checarNovoPreco(10_000, 7_000, false);
    expect(queda.ok).toBe(false);
    expect(queda.ok === false && queda.precisaConfirmar).toBe(true);
    expect(checarNovoPreco(10_000, 7_000, true).ok).toBe(true);
    expect(checarNovoPreco(10_000, 20_000, false).ok).toBe(false);
    expect(checarNovoPreco(10_000, 19_900, false).ok).toBe(true);
  });
});

import { calcularRecebimento } from "./precos";

describe("calcularRecebimento", () => {
  it("desconta tarifa, frete, custo e imposto", () => {
    // R$ 100 − 12 tarifa − 20 frete = 68; − 40 custo − 10 imposto = 18 (18%)
    expect(
      calcularRecebimento({
        precoVendaCentavos: 10_000,
        tarifaCentavos: 1_200,
        freteCentavos: 2_000,
        custoCentavos: 4_000,
        impostoPct: 10,
      }),
    ).toEqual({ recebeCentavos: 6_800, margemCentavos: 1_800, margemPct: 18 });
  });
  it("sem tarifa ou frete não inventa número", () => {
    const r = calcularRecebimento({
      precoVendaCentavos: 10_000,
      tarifaCentavos: null,
      freteCentavos: 0,
      custoCentavos: 1,
      impostoPct: 1,
    });
    expect(r.recebeCentavos).toBeNull();
  });
  it("sem custo mostra só quanto recebe", () => {
    const r = calcularRecebimento({
      precoVendaCentavos: 5_000,
      tarifaCentavos: 600,
      freteCentavos: 0,
      custoCentavos: null,
      impostoPct: 10,
    });
    expect(r).toEqual({ recebeCentavos: 4_400, margemCentavos: null, margemPct: null });
  });
});
