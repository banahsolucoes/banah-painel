import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cifrar, decifrar } from "./crypto";

const chave = randomBytes(32).toString("base64");

describe("cifrar/decifrar", () => {
  it("ida e volta", () => {
    const token = "APP_USR-1234567890-abcdef";
    const c = cifrar(token, chave);
    expect(c).not.toContain(token);
    expect(decifrar(c, chave)).toBe(token);
  });

  it("cada cifragem é diferente (IV aleatório)", () => {
    expect(cifrar("x", chave)).not.toBe(cifrar("x", chave));
  });

  it("falha com chave errada ou dado adulterado", () => {
    const c = cifrar("segredo", chave);
    expect(() => decifrar(c, randomBytes(32).toString("base64"))).toThrow();
    expect(() => decifrar(`${c.slice(0, -2)}AA`, chave)).toThrow();
  });
});
