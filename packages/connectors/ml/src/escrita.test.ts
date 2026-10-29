import { afterEach, describe, expect, it, vi } from "vitest";
import { alterarPreco } from "./escrita";
import { MlErro, mensagemDoErro } from "./http";

describe("alterarPreco", () => {
  afterEach(() => vi.unstubAllGlobals());

  const capturar = () => {
    const chamadas: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string | URL, init: RequestInit) => {
      chamadas.push({ url: String(url), init });
      return new Response("{}");
    });
    return chamadas;
  };

  it("sem variações manda o preço no item", async () => {
    const c = capturar();
    await alterarPreco("t", { id: "MLB1", price: 10, status: "active" }, 12.9);
    expect(c[0]?.init.method).toBe("PUT");
    expect(c[0]?.url).toContain("/items/MLB1");
    expect(JSON.parse(String(c[0]?.init.body))).toEqual({ price: 12.9 });
  });

  it("com variações manda o mesmo preço em cada uma", async () => {
    const c = capturar();
    const item = {
      id: "MLB2",
      price: 10,
      status: "active",
      variations: [
        { id: 1, price: 10 },
        { id: 2, price: 10 },
      ],
    };
    await alterarPreco("t", item, 9.5);
    expect(JSON.parse(String(c[0]?.init.body))).toEqual({
      variations: [
        { id: 1, price: 9.5 },
        { id: 2, price: 9.5 },
      ],
    });
  });

  it("traduz o erro do ML numa frase", () => {
    const e = new MlErro(
      400,
      "/items/MLB1",
      JSON.stringify({ message: "Validation error", cause: [{ message: "price is too low" }] }),
    );
    expect(mensagemDoErro(e)).toBe("Validation error · price is too low");
  });
});
