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
