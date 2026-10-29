import {
  anuncios,
  coletas,
  conferencias,
  type contasCanal,
  type Db,
  estoqueDiario,
  pedidoItens,
  pedidos,
} from "@banah/db";
import { deReais, diaLocal, log } from "@banah/shared";
import { eq, sql } from "drizzle-orm";
import { buscarAnuncios, buscarPedidos, listarIdsAnuncios, skuDoItem } from "./api";

type Conta = typeof contasCanal.$inferSelect;

/** Pedidos com estes status não contam como venda. */
const STATUS_SEM_VENDA = new Set(["cancelled", "invalid"]);
export const pedidoContaComoVenda = (status: string) => !STATUS_SEM_VENDA.has(status);

/** Local do estoque a partir do tipo logístico do anúncio. */
export const localDoEstoque = (logistica?: string | null) =>
  logistica === "fulfillment" ? "FULL_ML" : "PROPRIO";

const excluido = (coluna: string) => sql.raw(`excluded.${coluna}`);

async function registrarColeta<T extends { totalApi: number; gravados: number }>(
  db: Db,
  conta: Conta,
  tipo: string,
  conferencia: { tipo: string; dia: string },
  trabalho: () => Promise<T>,
): Promise<T> {
  const [c] = await db
    .insert(coletas)
    .values({ clienteId: conta.clienteId, contaId: conta.id, tipo })
    .returning({ id: coletas.id });
  try {
    const r = await trabalho();
    await db
      .update(coletas)
      .set({ fim: new Date(), status: "ok", totalApi: r.totalApi, gravados: r.gravados })
      .where(eq(coletas.id, c?.id ?? 0));
    const ok = r.totalApi === r.gravados;
    await db
      .insert(conferencias)
      .values({
        clienteId: conta.clienteId,
        dia: conferencia.dia,
        tipo: conferencia.tipo,
        esperado: r.totalApi,
        obtido: r.gravados,
        ok,
      })
      .onConflictDoUpdate({
        target: [conferencias.clienteId, conferencias.dia, conferencias.tipo],
        set: { esperado: r.totalApi, obtido: r.gravados, ok, criadoEm: new Date() },
      });
    if (!ok) log.warn("conferência com diferença", { tipo, ...r });
    return r;
  } catch (erro) {
    await db
      .update(coletas)
      .set({
        fim: new Date(),
        status: "erro",
        erro: erro instanceof Error ? erro.message : String(erro),
      })
      .where(eq(coletas.id, c?.id ?? 0));
    throw erro;
  }
}

/** Anúncios + foto do estoque de hoje. */
export function coletarAnuncios(db: Db, conta: Conta, token: string) {
  const hoje = diaLocal();
  return registrarColeta(db, conta, "ml.anuncios", { tipo: "ml.anuncios", dia: hoje }, async () => {
    const ids = await listarIdsAnuncios(token, conta.sellerId);
    const itens = await buscarAnuncios(token, ids);

    for (let i = 0; i < itens.length; i += 100) {
      const lote = itens.slice(i, i + 100);
      await db
        .insert(anuncios)
        .values(
          lote.map((it) => ({
            clienteId: conta.clienteId,
            contaId: conta.id,
            itemId: it.id,
            titulo: it.title,
            sku: skuDoItem(it),
            precoCentavos: deReais(it.price),
            status: it.status,
            logistica: it.shipping?.logistic_type ?? null,
            catalogo: Boolean(it.catalog_listing),
            catalogProductId: it.catalog_product_id ?? null,
            permalink: it.permalink ?? null,
            thumbnail: it.thumbnail ?? null,
            canalCriadoEm: it.date_created ? new Date(it.date_created) : null,
          })),
        )
        .onConflictDoUpdate({
          target: [anuncios.clienteId, anuncios.itemId],
          set: {
            titulo: excluido("titulo"),
            sku: excluido("sku"),
            precoCentavos: excluido("preco_centavos"),
            status: excluido("status"),
            logistica: excluido("logistica"),
            catalogo: excluido("catalogo"),
            catalogProductId: excluido("catalog_product_id"),
            permalink: excluido("permalink"),
            thumbnail: excluido("thumbnail"),
            canalCriadoEm: excluido("canal_criado_em"),
            atualizadoEm: sql`now()`,
          },
        });

      await db
        .insert(estoqueDiario)
        .values(
          lote.map((it) => ({
            clienteId: conta.clienteId,
            itemId: it.id,
            local: localDoEstoque(it.shipping?.logistic_type),
            dia: hoje,
            disponivel: it.available_quantity ?? 0,
          })),
        )
        .onConflictDoUpdate({
          target: [
            estoqueDiario.clienteId,
            estoqueDiario.itemId,
            estoqueDiario.local,
            estoqueDiario.dia,
          ],
          set: { disponivel: excluido("disponivel"), atualizadoEm: sql`now()` },
        });
    }
    return { totalApi: ids.length, gravados: itens.length };
  });
}

/** Pedidos de uma janela. Gravação idempotente: rodar duas vezes dá o mesmo resultado. */
export function coletarPedidos(
  db: Db,
  conta: Conta,
  token: string,
  janela: { campo: "date_created" | "date_last_updated"; de: Date; ate: Date },
  conferencia: { tipo: string; dia: string },
) {
  return registrarColeta(db, conta, "ml.pedidos", conferencia, async () => {
    const { itens: lista, total } = await buscarPedidos(token, conta.sellerId, janela);

    for (let i = 0; i < lista.length; i += 100) {
      const lote = lista.slice(i, i + 100);
      await db
        .insert(pedidos)
        .values(
          lote.map((p) => ({
            clienteId: conta.clienteId,
            contaId: conta.id,
            orderId: String(p.id),
            packId: p.pack_id ? String(p.pack_id) : null,
            status: p.status,
            totalCentavos: deReais(p.total_amount),
            canalCriadoEm: new Date(p.date_created),
            canalAtualizadoEm: p.last_updated ? new Date(p.last_updated) : null,
            diaVenda: diaLocal(new Date(p.date_created)),
          })),
        )
        .onConflictDoUpdate({
          target: [pedidos.clienteId, pedidos.orderId],
          set: {
            status: excluido("status"),
            totalCentavos: excluido("total_centavos"),
            canalAtualizadoEm: excluido("canal_atualizado_em"),
            packId: excluido("pack_id"),
            atualizadoEm: sql`now()`,
          },
        });

      const linhas = lote.flatMap((p) =>
        p.order_items.map((oi) => ({
          clienteId: conta.clienteId,
          orderId: String(p.id),
          itemId: oi.item.id,
          variacaoId: oi.item.variation_id ? String(oi.item.variation_id) : "",
          sku: oi.item.seller_sku ?? null,
          titulo: oi.item.title ?? null,
          quantidade: oi.quantity,
          precoUnitCentavos: deReais(oi.unit_price),
        })),
      );
      if (linhas.length > 0) {
        await db
          .insert(pedidoItens)
          .values(linhas)
          .onConflictDoUpdate({
            target: [
              pedidoItens.clienteId,
              pedidoItens.orderId,
              pedidoItens.itemId,
              pedidoItens.variacaoId,
            ],
            set: {
              quantidade: excluido("quantidade"),
              precoUnitCentavos: excluido("preco_unit_centavos"),
              sku: excluido("sku"),
              titulo: excluido("titulo"),
            },
          });
      }
    }
    return { totalApi: total, gravados: lista.length };
  });
}
