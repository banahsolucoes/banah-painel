import { describe, expect, it } from "vitest";
import { centavos, deReais, somar } from "./money";

describe("deReais", () => {
  it("converte sem erro de ponto flutuante", () => {
    expect(deReais(31.48)).toBe(3148);
    expect(deReais(0.1 + 0.2)).toBe(30);
    expect(deReais("80,15")).toBe(8015);
  });

  it("mantém o sinal", () => {
    expect(deReais(-48.67)).toBe(-4867);
    expect(deReais("-0.05")).toBe(-5);
  });

  it("aceita inteiros e uma casa decimal", () => {
    expect(deReais(30000)).toBe(3000000);
    expect(deReais("12.5")).toBe(1250);
  });
});

describe("centavos", () => {
  it("recusa valor quebrado", () => {
    expect(() => centavos(10.5)).toThrow();
  });

  it("soma", () => {
    expect(somar(centavos(100), centavos(-30))).toBe(70);
  });
});
