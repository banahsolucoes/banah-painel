import {
  itensDaPromocao,
  type MlPromocao,
  type MlPromocaoItem,
  promocoesDoItem,
  subsidioDoMl,
} from "@banah/connector-ml";
import { calcularRecebimento } from "@banah/core";
import { anuncios, db, produtosCusto } from "@banah/db";
import { deReais } from "@banah/shared";
import { and, eq } from "drizzle-orm";
import { tarifasOficiais } from "./ml";

export type LinhaEmPromocao = {
  itemId: string;
  titulo: string;
  sku: string | null;
  promoId: string;
  tipo: string;
  campanha: string;
  offerId: string | null;
  cheioCentavos: number;
  promoCentavos: number;
  subsidioCentavos: number;
  recebeCentavos: number | null;
  margemCentavos: number | null;
  margemPct: number | null;
  semCusto: boolean;
  fim: string | null;
};

/**
 * Anúncios com promoção ativa agora, de qualquer origem: campanhas do ML e desconto
 * próprio. Junta duas fontes (itens "participando" de cada campanha e anúncios cujo
 * preço de venda está abaixo do cheio) e confirma no ML anúncio por anúncio.
 */
export async function carregarEmPromocao(
  clienteId: string,
  token: string,
  campanhas: MlPromocao[],
  impostoPct: number | null,
): Promise<LinhaEmPromocao[]> {
  const lista = await db()
    .select()
    .from(anuncios)
    .where(and(eq(anuncios.clienteId, clienteId), eq(anuncios.status, "active")));
  const porItem = new Map(lista.map((a) => [a.itemId, a]));

  // Fonte 1: quem está participando em cada campanha aberta.
  const daCampanha = new Map<string, { promo: MlPromocao; item: MlPromocaoItem }[]>();
  for (const promo of campanhas.filter((c) => c.status !== "finished")) {
    const itens = await itensDaPromocao(token, promo, ["started"]).catch(() => []);
    for (const item of itens) {
      daCampanha.set(item.id, [...(daCampanha.get(item.id) ?? []), { promo, item }]);
    }
  }
  // Fonte 2: preço de venda abaixo do cheio na última coleta (pega o desconto próprio).
  const ids = new Set([
    ...daCampanha.keys(),
    ...lista
      .filter((a) => a.precoCheioCentavos !== null && a.precoCentavos < a.precoCheioCentavos)
      .map((a) => a.itemId),
  ]);

  const brutas: Omit<
    LinhaEmPromocao,
    "recebeCentavos" | "margemCentavos" | "margemPct" | "semCusto" | "titulo" | "sku"
  >[] = [];
  const idsLista = [...ids];
  for (let i = 0; i < idsLista.length; i += 5) {
    await Promise.all(
      idsLista.slice(i, i + 5).map(async (itemId) => {
        const doItem = await promocoesDoItem(token, itemId).catch(() => null);
        const ativas = (doItem ?? []).filter((p) => p.status === "started");
        if (ativas.length > 0) {
          for (const p of ativas) {
            const oferta =
              p.offers?.find((o) => (o.status ?? "").toLowerCase() === "active") ?? p.offers?.[0];
            const cheio = p.original_price ?? oferta?.original_price;
            const preco = p.price ?? oferta?.new_price;
            if (!cheio || !preco) continue;
            brutas.push({
              itemId,
              promoId: p.id,
              tipo: p.type,
              campanha: p.name ?? "",
              offerId: oferta?.id ?? null,
              cheioCentavos: deReais(cheio),
              promoCentavos: deReais(preco),
              subsidioCentavos: deReais(
                subsidioDoMl({
                  id: itemId,
                  status: "started",
                  original_price: cheio,
                  price: preco,
                  meli_percentage: p.benefits?.meli_percent ?? null,
                  seller_percentage: p.benefits?.seller_percent ?? null,
                }),
              ),
              fim: oferta?.end_date ?? p.finish_date ?? null,
            });
          }
          return;
        }
        // Sem resposta por anúncio: usa o que veio da campanha.
        for (const { promo, item } of daCampanha.get(itemId) ?? []) {
          if (!item.original_price || !item.price) continue;
          brutas.push({
            itemId,
            promoId: promo.id,
            tipo: promo.type,
            campanha: promo.name ?? "",
            offerId: item.offer_id ?? null,
            cheioCentavos: deReais(item.original_price),
            promoCentavos: deReais(item.price),
            subsidioCentavos: deReais(subsidioDoMl(item)),
            fim: item.end_date ?? promo.finish_date ?? null,
          });
        }
      }),
    );
  }

  const custos = new Map(
    (await db().select().from(produtosCusto).where(eq(produtosCusto.clienteId, clienteId))).map(
      (c) => [c.sku, c.custoCentavos],
    ),
  );
  const pedido = (b: (typeof brutas)[number]) => {
    const a = porItem.get(b.itemId);
    return {
      precoCentavos: b.promoCentavos,
      tipo: a?.tipoAnuncio ?? null,
      categoria: a?.categoriaId ?? null,
      logistica: a?.logistica ?? null,
    };
  };
  const tarifaDe = await tarifasOficiais(token, brutas.map(pedido));

  return brutas
    .map((b) => {
      const a = porItem.get(b.itemId);
      const custo = a?.sku ? (custos.get(a.sku) ?? null) : null;
      const r = calcularRecebimento({
        precoVendaCentavos: b.promoCentavos,
        tarifaCentavos: tarifaDe(pedido(b)),
        freteCentavos: a?.freteGratis === false ? 0 : (a?.freteCustoCentavos ?? null),
        custoCentavos: custo,
        impostoPct,
      });
      const recebe = r.recebeCentavos === null ? null : r.recebeCentavos + b.subsidioCentavos;
      const margem = r.margemCentavos === null ? null : r.margemCentavos + b.subsidioCentavos;
      return {
        ...b,
        titulo: a?.titulo ?? b.itemId,
        sku: a?.sku ?? null,
        recebeCentavos: recebe,
        margemCentavos: margem,
        margemPct: margem === null ? null : (margem / b.promoCentavos) * 100,
        semCusto: custo === null,
      };
    })
    .sort((x, y) => (x.margemPct ?? 999) - (y.margemPct ?? 999));
}
