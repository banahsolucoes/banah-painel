import {
  anuncios,
  clientes,
  conferencias,
  contasCanal,
  db,
  estoqueDiario,
  pedidoItens,
  pedidos,
} from "@banah/db";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { coletarAnuncios, coletarPedidos } from "./coleta";

/**
 * Coleta contra um Postgres de verdade, com a API do ML simulada.
 * Confere gravação, foto do estoque, conferência e idempotência.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

const ITENS = [
  {
    id: "MLB1",
    title: "Barra roscada 5/16",
    price: 23.9,
    available_quantity: 40,
    status: "active",
    shipping: { logistic_type: "fulfillment" },
    date_created: "2026-05-10T10:00:00.000Z",
    seller_custom_field: "BR-516",
    user_product_id: "MLBU1",
  },
  {
    id: "MLB2",
    title: "Kit bucha 10mm",
    price: 19.5,
    available_quantity: 120,
    status: "paused",
    shipping: { logistic_type: "cross_docking" },
  },
];

const PEDIDOS = [
  {
    id: 9001,
    status: "paid",
    total_amount: 47.8,
    date_created: "2026-10-20T15:00:00.000-03:00",
    order_items: [{ item: { id: "MLB1", seller_sku: "BR-516" }, quantity: 2, unit_price: 23.9 }],
  },
  {
    id: 9002,
    status: "cancelled",
    total_amount: 19.5,
    date_created: "2026-10-21T10:00:00.000-03:00",
    order_items: [{ item: { id: "MLB2" }, quantity: 1, unit_price: 19.5 }],
  },
];

function respostaMl(url: string) {
  const u = new URL(url);
  if (u.pathname.endsWith("/items/search")) {
    const segunda = u.searchParams.has("scroll_id");
    return {
      results: segunda ? [] : ITENS.map((i) => i.id),
      scroll_id: "s1",
      paging: { total: ITENS.length },
    };
  }
  if (u.pathname === "/items") {
    const ids = (u.searchParams.get("ids") ?? "").split(",");
    return ids.map((id) => ({ code: 200, body: ITENS.find((i) => i.id === id) }));
  }
  if (u.pathname === "/user-products/MLBU1/stock") {
    return {
      locations: [
        { type: "meli_facility", quantity: 30 },
        { type: "selling_address", quantity: 41 },
      ],
    };
  }
  if (u.pathname === "/orders/search") {
    const offset = Number(u.searchParams.get("offset") ?? 0);
    return {
      results: offset === 0 ? PEDIDOS : [],
      paging: { total: PEDIDOS.length, offset, limit: 50 },
    };
  }
  throw new Error(`rota não simulada: ${u.pathname}`);
}

describe.skipIf(!temBanco)("coleta do Mercado Livre", () => {
  let clienteId = "";
  let conta: typeof contasCanal.$inferSelect;

  beforeAll(async () => {
    vi.stubGlobal(
      "fetch",
      async (url: string | URL) => new Response(JSON.stringify(respostaMl(String(url)))),
    );
    const [c] = await db().insert(clientes).values({ nome: "Teste coleta" }).returning();
    clienteId = c?.id ?? "";
    const [k] = await db()
      .insert(contasCanal)
      .values({
        clienteId,
        canal: "MELI",
        sellerId: `teste-${clienteId}`,
        accessTokenCifrado: "x",
        refreshTokenCifrado: "x",
        expiraEm: new Date(Date.now() + 3600e3),
      })
      .returning();
    if (!k) throw new Error("conta não criada");
    conta = k;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await db().delete(clientes).where(eq(clientes.id, clienteId));
  });

  it("grava anúncios, foto do estoque e conferência", async () => {
    const r = await coletarAnuncios(db(), conta, "token");
    expect(r).toEqual({ totalApi: 2, gravados: 2 });

    const lista = await db().select().from(anuncios).where(eq(anuncios.clienteId, clienteId));
    const barra = lista.find((a) => a.itemId === "MLB1");
    expect(barra?.precoCentavos).toBe(2390);
    expect(barra?.sku).toBe("BR-516");

    const fotos = await db()
      .select()
      .from(estoqueDiario)
      .where(eq(estoqueDiario.clienteId, clienteId));
    // MLB1 usa o estoque por depósito do produto; MLB2 não tem produto e usa o do anúncio.
    const mlb1 = fotos.filter((f) => f.itemId === "MLB1");
    expect(mlb1.find((f) => f.local === "FULL_ML")?.disponivel).toBe(30);
    expect(mlb1.find((f) => f.local === "PROPRIO")?.disponivel).toBe(41);
    expect(fotos.find((f) => f.itemId === "MLB2")?.local).toBe("PROPRIO");
    expect(fotos.find((f) => f.itemId === "MLB2")?.disponivel).toBe(120);

    const [conf] = await db()
      .select()
      .from(conferencias)
      .where(and(eq(conferencias.clienteId, clienteId), eq(conferencias.tipo, "ml.anuncios")));
    expect(conf?.ok).toBe(true);
  });

  it("grava pedidos e itens sem duplicar ao rodar duas vezes", async () => {
    const janela = {
      campo: "date_created" as const,
      de: new Date("2026-10-01"),
      ate: new Date("2026-10-29"),
    };
    const conf = { tipo: "ml.pedidos.teste", dia: "2026-10-29" };
    await coletarPedidos(db(), conta, "token", janela, conf);
    await coletarPedidos(db(), conta, "token", janela, conf);

    const ps = await db().select().from(pedidos).where(eq(pedidos.clienteId, clienteId));
    expect(ps).toHaveLength(2);
    expect(ps.find((p) => p.orderId === "9001")?.diaVenda).toBe("2026-10-20");
    const its = await db().select().from(pedidoItens).where(eq(pedidoItens.clienteId, clienteId));
    expect(its).toHaveLength(2);
    expect(its.find((i) => i.orderId === "9001")?.quantidade).toBe(2);
  });
});
