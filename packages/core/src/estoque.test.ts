import { describe, expect, it } from "vitest";
import { analisarEstoque, desdobrarKits, vendaMediaPonderada } from "./estoque";

const dias = (n: number, valor: number) => Array.from({ length: n }, () => valor);

describe("vendaMediaPonderada", () => {
  it("venda constante dá a própria venda", () => {
    expect(vendaMediaPonderada(dias(60, 3))).toBeCloseTo(3);
  });

  it("aceleração recente pesa mais", () => {
    const vendas = [...dias(53, 1), ...dias(7, 5)];
    expect(vendaMediaPonderada(vendas)).toBeGreaterThan(2.5);
  });

  it("com pouco histórico usa só o que tem", () => {
    expect(vendaMediaPonderada(dias(10, 2))).toBeCloseTo(2);
  });
});

describe("analisarEstoque", () => {
  it("conta nova: coletando, sem previsão", () => {
    const r = analisarEstoque({
      vendasDiarias: dias(12, 2),
      disponivel: 100,
      prazoReposicaoDias: 15,
    });
    expect(r.confianca).toBe("coletando");
    expect(r.previsao60d).toBeNull();
    expect(r.sugestaoCompra).toBeNull();
    expect(r.coberturaDias).toBeCloseTo(50);
  });

  it("ruptura iminente quando o estoque acaba antes da reposição chegar", () => {
    const r = analisarEstoque({
      vendasDiarias: dias(60, 5),
      disponivel: 40,
      prazoReposicaoDias: 15,
    });
    expect(r.confianca).toBe("normal");
    expect(r.coberturaDias).toBeCloseTo(8);
    expect(r.status).toBe("ruptura_iminente");
    // 60d * 5 = 300 + 7d de segurança (35) − 40 disponível = 295
    expect(r.sugestaoCompra).toBe(295);
  });

  it("comprar quando chega no ponto de reposição", () => {
    const r = analisarEstoque({
      vendasDiarias: dias(60, 5),
      disponivel: 100,
      prazoReposicaoDias: 15,
    });
    expect(r.pontoReposicao).toBe(110);
    expect(r.status).toBe("comprar");
  });

  it("estoque em trânsito entra na conta", () => {
    const r = analisarEstoque({
      vendasDiarias: dias(60, 5),
      disponivel: 100,
      emTransito: 200,
      prazoReposicaoDias: 15,
    });
    expect(r.status).toBe("ok");
    expect(r.sugestaoCompra).toBe(35);
  });

  it("capacidade do Full limita a sugestão", () => {
    const r = analisarEstoque({
      vendasDiarias: dias(60, 20),
      disponivel: 100,
      prazoReposicaoDias: 15,
      capacidadeMax: 1000,
    });
    expect(r.sugestaoCompra).toBe(900);
  });

  it("excesso e parado", () => {
    expect(
      analisarEstoque({ vendasDiarias: dias(60, 1), disponivel: 500, prazoReposicaoDias: 15 })
        .status,
    ).toBe("excesso");
    expect(
      analisarEstoque({
        vendasDiarias: [...dias(30, 2), ...dias(30, 0)],
        disponivel: 50,
        prazoReposicaoDias: 15,
      }).status,
    ).toBe("parado");
  });

  it("amostra de 30 a 59 dias: previsão com confiança baixa", () => {
    const r = analisarEstoque({
      vendasDiarias: dias(45, 2),
      disponivel: 300,
      prazoReposicaoDias: 15,
    });
    expect(r.confianca).toBe("baixa");
    expect(r.previsao60d).toBe(120);
  });
});

describe("desdobrarKits", () => {
  it("transforma demanda de kit em demanda de componente", () => {
    expect(
      desdobrarKits(
        { "KIT-516": 10, "KIT-38": 5 },
        {
          "KIT-516": [
            { componente: "BARRA-516", quantidade: 1 },
            { componente: "PORCA-516", quantidade: 4 },
          ],
          "KIT-38": [{ componente: "PORCA-516", quantidade: 2 }],
        },
      ),
    ).toEqual({ "BARRA-516": 10, "PORCA-516": 50 });
  });
});
