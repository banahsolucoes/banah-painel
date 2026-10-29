import { describe, expect, it } from "vitest";
import { lerTabelaCustos, lerValorReais } from "./custos";

describe("lerValorReais", () => {
  it("formatos brasileiros e simples", () => {
    expect(lerValorReais("R$ 23,00")).toBe(2300);
    expect(lerValorReais("R$ 1.234,56")).toBe(123456);
    expect(lerValorReais("40,42")).toBe(4042);
    expect(lerValorReais("23.5")).toBe(2350);
    expect(lerValorReais("")).toBeNull();
    expect(lerValorReais("abc")).toBeNull();
  });
});

describe("lerTabelaCustos", () => {
  const tabela = [
    "SKU\tStatus\tTítulo do anúncio\tValor de Custo",
    "(sem SKU)\tInativo\t10 Barra Roscada 3/8\t",
    "282KB0102017\tInativo\tBarra Roscada 1/4\tR$ 23,00",
    "365AA0101528\tAtivo\tBolsa Mala\tR$ 40,42",
    "400AA0101999\tAtivo\tSem custo ainda\t",
  ].join("\n");

  it("lê SKU e custo pelas colunas do cabeçalho", () => {
    const r = lerTabelaCustos(tabela);
    expect(r.linhas).toEqual([
      { sku: "282KB0102017", custoCentavos: 2300 },
      { sku: "365AA0101528", custoCentavos: 4042 },
    ]);
    expect(r.ignoradas.map((i) => i.motivo)).toEqual(["sem SKU", "sem custo"]);
  });

  it("recusa tabela sem as colunas certas", () => {
    expect(lerTabelaCustos("a\tb\n1\t2").ignoradas[0]?.motivo).toContain("cabeçalho");
  });

  it("aceita ponto e vírgula e SKU repetido fica com o último", () => {
    const r = lerTabelaCustos("SKU;Custo\nA1;10,00\nA1;12,00");
    expect(r.linhas).toEqual([{ sku: "A1", custoCentavos: 1200 }]);
  });
});
