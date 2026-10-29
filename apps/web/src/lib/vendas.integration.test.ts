import {
  adsDiario,
  anuncios,
  clientes,
  contasCanal,
  db,
  pedidoItens,
  pedidos,
  produtosCusto,
  reputacaoDiaria,
} from "@banah/db";
import { diaLocal } from "@banah/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { carregarVendas } from "./vendas";

/** Dashboard de vendas contra um Postgres real com dados montados à mão. */
const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)("dashboard de vendas", () => {
  let clienteId = "";

  beforeAll(async () => {
    const hoje = diaLocal();
    const [c] = await db()
      .insert(clientes)
      .values({ nome: "Teste vendas", config: { aliquotaImpostoPct: 10 } })
      .returning();
    clienteId = c?.id ?? "";
    const [k] = await db()
      .insert(contasCanal)
      .values({
        clienteId,
        canal: "MELI",
        sellerId: `v-${clienteId}`,
        accessTokenCifrado: "x",
        refreshTokenCifrado: "x",
        expiraEm: new Date(),
      })
      .returning();
    const contaId = k?.id ?? "";
    await db().insert(anuncios).values({
      clienteId,
      contaId,
      itemId: "MLB1",
      titulo: "Barra",
      sku: "S1",
      precoCentavos: 5000,
      status: "active",
    });
    await db().insert(produtosCusto).values({ clienteId, sku: "S1", custoCentavos: 2000 });
    // Dois pedidos do mesmo carrinho (mesmo envio) + um cancelado.
    const pedido = (orderId: string, status: string, ship: string | null) => ({
      clienteId,
      contaId,
      orderId,
      status,
      totalCentavos: 10_000,
      canalCriadoEm: new Date(),
      diaVenda: hoje,
      shippingId: ship,
      tarifasCentavos: 1_200,
      freteVendedorCentavos: 1_500,
    });
    await db()
      .insert(pedidos)
      .values([
        pedido("1", "paid", "E1"),
        pedido("2", "paid", "E1"),
        pedido("3", "cancelled", "E2"),
      ]);
    await db()
      .insert(pedidoItens)
      .values(
        ["1", "2", "3"].map((o) => ({
          clienteId,
          orderId: o,
          itemId: "MLB1",
          quantidade: 2,
          precoUnitCentavos: 5000,
        })),
      );
    await db().insert(adsDiario).values({
      clienteId,
      itemId: "MLB1",
      dia: hoje,
      cliques: 100,
      impressoes: 4000,
      custoCentavos: 2_000,
      receitaCentavos: 10_000,
      unidades: 2,
    });
    await db()
      .insert(reputacaoDiaria)
      .values({ clienteId, contaId, dia: hoje, nivel: "5_green", reclamacoesTaxa: 0.01 });
  });

  afterAll(async () => {
    await db().delete(clientes).where(eq(clientes.id, clienteId));
  });

  it("calcula vendas, frete por envio, custo, ads e reputação", async () => {
    const d = await carregarVendas(clienteId, "hoje");
    const a = d?.atual.indicadores;
    expect(a?.pedidos).toBe(2);
    expect(a?.faturamentoCentavos).toBe(20_000);
    expect(a?.ticketMedioCentavos).toBe(10_000);
    expect(d?.atual.freteCentavos).toBe(1_500); // um envio para os dois pedidos
    expect(a?.receitaLiquidaCentavos).toBe(20_000 - 2_400 - 1_500);
    expect(d?.atual.custoCentavos).toBe(8_000); // 4 unidades × R$ 20
    // 16.100 − 8.000 − 2.000 (imposto 10%) − 2.000 (ads)
    expect(a?.margemCentavos).toBe(4_100);
    expect(a?.roas).toBeCloseTo(5);
    expect(a?.tacosPct).toBeCloseTo(10);
    expect(a?.cpcCentavos).toBe(20);
    expect(d?.reputacao?.nivel).toBe("5_green");
    expect(d?.serie).toHaveLength(30);
    expect(d?.top[0]?.item_id).toBe("MLB1");
  });
});
