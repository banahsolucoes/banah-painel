import { afterEach, describe, expect, it, vi } from "vitest";
import { entrarNaPromocao, sairDaPromocao, subsidioDoMl } from "./promocoes";

describe("promoções", () => {
  afterEach(() => vi.unstubAllGlobals());
  const capturar = () => {
    const c: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string | URL, init: RequestInit) => {
      c.push({ url: String(url), init });
      return new Response("{}");
    });
    return c;
  };

  it("campanha com preço manda deal_price", async () => {
    const c = capturar();
    await entrarNaPromocao("t", "MLB1", { id: "P1", type: "DEAL" }, { precoReais: 39.9 });
    expect(c[0]?.url).toContain("/seller-promotions/items/MLB1?app_version=v2");
    expect(JSON.parse(String(c[0]?.init.body))).toEqual({
      promotion_id: "P1",
      promotion_type: "DEAL",
      deal_price: 39.9,
    });
  });

  it("campanha por oferta manda offer_id", async () => {
    const c = capturar();
    await entrarNaPromocao("t", "MLB1", { id: "P2", type: "SMART" }, { offerId: "O9" });
    expect(JSON.parse(String(c[0]?.init.body))).toEqual({
      promotion_id: "P2",
      promotion_type: "SMART",
      offer_id: "O9",
    });
  });

  it("sair manda tipo, campanha e oferta na URL", async () => {
    const c = capturar();
    await sairDaPromocao("t", "MLB1", { id: "P2", type: "SMART" }, "O9");
    expect(c[0]?.init.method).toBe("DELETE");
    expect(c[0]?.url).toContain("promotion_type=SMART");
    expect(c[0]?.url).toContain("promotion_id=P2");
    expect(c[0]?.url).toContain("offer_id=O9");
  });

  it("subsídio do ML em pontos do preço cheio", () => {
    // cheio 100, preço 85: ML banca 5 pontos, vendedor 10 → ML paga R$ 5
    expect(
      subsidioDoMl({
        id: "x",
        status: "candidate",
        original_price: 100,
        price: 85,
        meli_percentage: 5,
        seller_percentage: 10,
      }),
    ).toBeCloseTo(5);
  });
});
