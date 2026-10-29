import { describe, expect, it } from "vitest";
import { MAX_TENTATIVAS, proximaEspera } from "./backoff";

describe("proximaEspera", () => {
  it("cresce a cada falha", () => {
    expect(proximaEspera(1)).toBe(1);
    expect(proximaEspera(2)).toBe(5);
    expect(proximaEspera(3)).toBe(30);
    expect(proximaEspera(4)).toBe(120);
  });

  it("desiste na 5ª falha", () => {
    expect(MAX_TENTATIVAS).toBe(5);
    expect(proximaEspera(5)).toBeNull();
  });
});
