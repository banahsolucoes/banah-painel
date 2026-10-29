import { describe, expect, it } from "vitest";
import { calcularIndicadores } from "./vendas";

const base = {
  faturamentoCentavos: 100_000, // R$ 1.000
  pedidos: 20,
  unidades: 30,
  tarifasCentavos: 12_000,
  freteCentavos: 8_000,
  custoCentavos: 50_000,
  impostoPct: 10,
  adsCustoCentavos: 5_000,
  adsReceitaCentavos: 40_000,
  adsCliques: 250,
  adsImpressoes: 10_000,
};

describe("calcularIndicadores", () => {
  it("vendas, receita e margem", () => {
    const r = calcularIndicadores(base);
    expect(r.ticketMedioCentavos).toBe(5_000);
    expect(r.receitaLiquidaCentavos).toBe(80_000);
    expect(r.impostoCentavos).toBe(10_000);
    // 80.000 − 50.000 − 10.000 − 5.000
    expect(r.margemCentavos).toBe(15_000);
    expect(r.margemPct).toBeCloseTo(15);
  });

  it("indicadores de ads", () => {
    const r = calcularIndicadores(base);
    expect(r.cpcCentavos).toBe(20);
    expect(r.roas).toBeCloseTo(8);
    expect(r.acosPct).toBeCloseTo(12.5);
    expect(r.tacosPct).toBeCloseTo(5);
    expect(r.ctrPct).toBeCloseTo(2.5);
  });

  it("sem imposto configurado não inventa margem", () => {
    const r = calcularIndicadores({ ...base, impostoPct: null });
    expect(r.margemCentavos).toBeNull();
    expect(r.margemPct).toBeNull();
  });

  it("sem vendas nem ads não divide por zero", () => {
    const r = calcularIndicadores({
      ...base,
      faturamentoCentavos: 0,
      pedidos: 0,
      adsCustoCentavos: 0,
      adsReceitaCentavos: 0,
      adsCliques: 0,
      adsImpressoes: 0,
    });
    expect(r.ticketMedioCentavos).toBeNull();
    expect(r.roas).toBeNull();
    expect(r.acosPct).toBeNull();
    expect(r.tacosPct).toBeNull();
    expect(r.cpcCentavos).toBeNull();
  });
});
