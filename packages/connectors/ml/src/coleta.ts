import {
  adsDiario,
  anuncios,
  coletas,
  conferencias,
  type contasCanal,
  type Db,
  estoqueDiario,
  pedidoItens,
  pedidos,
  reputacaoDiaria,
  contasCanal as tabelaContas,
} from "@banah/db";
import { deReais, diaLocal, log } from "@banah/shared";
import { and, eq, inArray, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import {
  buscarAnunciante,
  buscarAnuncios,
  buscarEstoqueProduto,
  buscarFreteGratis,
  buscarMetricasAds,
  buscarPedidos,
  buscarPrecoVenda,
  buscarReputacao,
  buscarTarifa,
  custoFreteVendedor,
  listarIdsAnuncios,
  localDoTipoEstoque,
  type MlItem,
  type MlPrecoVenda,
  type MlTarifa,
  produtosDoItem,
  skuDoItem,
} from "./api";
import { MlErro } from "./http";

type Conta = typeof contasCanal.$inferSelect;

/** Pedidos com estes status não contam como venda. */
const STATUS_SEM_VENDA = new Set(["cancelled", "invalid"]);
export const pedidoContaComoVenda = (status: string) => !STATUS_SEM_VENDA.has(status);

/** Local do estoque a partir do tipo logístico do anúncio. */
export const localDoEstoque = (logistica?: string | null) =>
  logistica === "fulfillment" ? "FULL_ML" : "PROPRIO";

/**
 * Estoque do anúncio por local. Usa o estoque do produto (por depósito) quando o
 * anúncio tem user_product_id; senão, o available_quantity do anúncio.
 * O cache evita buscar duas vezes o mesmo produto (anúncio clássico + catálogo).
 */
export async function estoquePorLocal(
  token: string,
  item: MlItem,
  cache: Map<string, Awaited<ReturnType<typeof buscarEstoqueProduto>> | null>,
): Promise<Map<string, number>> {
  const porLocal = new Map<string, number>();
  const produtos = produtosDoItem(item);
  let completo = produtos.length > 0;
  for (const up of produtos) {
    if (!cache.has(up)) {
      try {
        cache.set(up, await buscarEstoqueProduto(token, up));
      } catch (e) {
        if (!(e instanceof MlErro) || e.status >= 500 || e.status === 429) throw e;
        cache.set(up, null); // produto sem estoque por depósito: usa o do anúncio
      }
    }
    const locais = cache.get(up);
    if (!locais) {
      completo = false;
      break;
    }
    for (const l of locais) {
      const local = localDoTipoEstoque(l.type);
      porLocal.set(local, (porLocal.get(local) ?? 0) + (l.quantity ?? 0));
    }
  }
  if (completo && porLocal.size > 0) return porLocal;
  return new Map([[localDoEstoque(item.shipping?.logistic_type), item.available_quantity ?? 0]]);
}

/**
 * Preço de venda (com promoção) e preço cheio dos anúncios ativos, 5 chamadas por vez.
 * Anúncio que não responder fica de fora e usa o preço do próprio item.
 */
/** 4xx que não seja 429 = dado indisponível para este anúncio; o resto derruba a coleta. */
async function talvez<T>(f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch (e) {
    if (!(e instanceof MlErro) || e.status === 429 || e.status >= 500) throw e;
    return null;
  }
}

type Comercial = {
  venda: MlPrecoVenda | null;
  tarifaCentavos: number | null;
  tarifaPct: number | null;
  freteCentavos: number | null;
};

/**
 * Para cada anúncio ativo: preço de venda (com promoção), tarifa oficial do ML nesse
 * preço e custo do frete grátis. 5 anúncios por vez; tarifa com cache por
 * preço+tipo+categoria (anúncios iguais não repetem a chamada).
 */
async function dadosComerciais(token: string, sellerId: string, itens: MlItem[]) {
  const mapa = new Map<string, Comercial>();
  const cacheTarifa = new Map<string, Promise<MlTarifa | null>>();
  const ativos = itens.filter((it) => it.status === "active");
  for (let i = 0; i < ativos.length; i += 5) {
    await Promise.all(
      ativos.slice(i, i + 5).map(async (it) => {
        const venda = await talvez(() => buscarPrecoVenda(token, it.id));
        const preco = venda?.amount ?? it.price;
        let tarifa: MlTarifa | null = null;
        if (it.listing_type_id && it.category_id) {
          const chave = `${preco}|${it.listing_type_id}|${it.category_id}|${it.shipping?.logistic_type ?? ""}`;
          if (!cacheTarifa.has(chave)) {
            cacheTarifa.set(
              chave,
              talvez(() =>
                buscarTarifa(token, {
                  preco,
                  tipo: it.listing_type_id as string,
                  categoria: it.category_id as string,
                  logistica: it.shipping?.logistic_type,
                }),
              ),
            );
          }
          tarifa = await (cacheTarifa.get(chave) as Promise<MlTarifa | null>);
        }
        const frete = it.shipping?.free_shipping
          ? await talvez(() => buscarFreteGratis(token, sellerId, it.id))
          : 0;
        mapa.set(it.id, {
          venda,
          tarifaCentavos:
            tarifa?.sale_fee_amount !== undefined ? deReais(tarifa.sale_fee_amount) : null,
          tarifaPct: tarifa?.sale_fee_details?.percentage_fee ?? null,
          freteCentavos: frete === null ? null : deReais(frete),
        });
      }),
    );
  }
  return mapa;
}

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
    const cacheProdutos = new Map<
      string,
      Awaited<ReturnType<typeof buscarEstoqueProduto>> | null
    >();

    const comercial = await dadosComerciais(token, conta.sellerId, itens);
    const precos = new Map(
      [...comercial].flatMap(([id, c]) => (c.venda ? [[id, c.venda] as const] : [])),
    );

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
            precoCentavos: deReais(precos.get(it.id)?.amount ?? it.price),
            precoCheioCentavos: deReais(
              precos.get(it.id)?.regular_amount ?? it.original_price ?? it.price,
            ),
            promocaoTipo: precos.get(it.id)?.regular_amount
              ? (precos.get(it.id)?.metadata?.promotion_type ?? "PROMOCAO")
              : null,
            tipoAnuncio: it.listing_type_id ?? null,
            categoriaId: it.category_id ?? null,
            freteGratis: it.shipping?.free_shipping ?? null,
            tarifaCentavos: comercial.get(it.id)?.tarifaCentavos ?? null,
            tarifaPct: comercial.get(it.id)?.tarifaPct ?? null,
            freteCustoCentavos: comercial.get(it.id)?.freteCentavos ?? null,
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
            precoCheioCentavos: excluido("preco_cheio_centavos"),
            promocaoTipo: excluido("promocao_tipo"),
            tipoAnuncio: excluido("tipo_anuncio"),
            categoriaId: excluido("categoria_id"),
            freteGratis: excluido("frete_gratis"),
            tarifaCentavos: excluido("tarifa_centavos"),
            tarifaPct: excluido("tarifa_pct"),
            freteCustoCentavos: excluido("frete_custo_centavos"),
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

      const fotos: {
        clienteId: string;
        itemId: string;
        local: string;
        dia: string;
        disponivel: number;
      }[] = [];
      for (const it of lote) {
        for (const [local, qtd] of await estoquePorLocal(token, it, cacheProdutos)) {
          fotos.push({
            clienteId: conta.clienteId,
            itemId: it.id,
            local,
            dia: hoje,
            disponivel: qtd,
          });
        }
      }
      // A foto de hoje é refeita inteira: um local que zerou não pode ficar com valor velho.
      await db.delete(estoqueDiario).where(
        and(
          eq(estoqueDiario.clienteId, conta.clienteId),
          eq(estoqueDiario.dia, hoje),
          inArray(
            estoqueDiario.itemId,
            lote.map((it) => it.id),
          ),
        ),
      );
      await db
        .insert(estoqueDiario)
        .values(fotos)
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
            shippingId: p.shipping?.id ? String(p.shipping.id) : null,
            tarifasCentavos: p.order_items.every((oi) => oi.sale_fee == null)
              ? null
              : p.order_items.reduce((t, oi) => t + deReais(oi.sale_fee ?? 0) * oi.quantity, 0),
          })),
        )
        .onConflictDoUpdate({
          target: [pedidos.clienteId, pedidos.orderId],
          set: {
            status: excluido("status"),
            totalCentavos: excluido("total_centavos"),
            canalAtualizadoEm: excluido("canal_atualizado_em"),
            packId: excluido("pack_id"),
            shippingId: excluido("shipping_id"),
            tarifasCentavos: excluido("tarifas_centavos"),
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
          tarifaUnitCentavos: oi.sale_fee == null ? null : deReais(oi.sale_fee),
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
              tarifaUnitCentavos: excluido("tarifa_unit_centavos"),
              sku: excluido("sku"),
              titulo: excluido("titulo"),
            },
          });
      }
    }
    return { totalApi: total, gravados: lista.length };
  });
}

/**
 * Frete pago pelo vendedor nos pedidos que ainda não têm esse valor.
 * Uma chamada por envio; processa no máximo `limite` por vez e continua na próxima rodada.
 */
export async function coletarFretes(db: Db, conta: Conta, token: string, limite = 40) {
  const pendentes = await db
    .select({ id: pedidos.id, shippingId: pedidos.shippingId })
    .from(pedidos)
    .where(
      and(
        eq(pedidos.contaId, conta.id),
        isNull(pedidos.freteVendedorCentavos),
        isNotNull(pedidos.shippingId),
        notInArray(pedidos.status, ["cancelled", "invalid"]),
      ),
    )
    .orderBy(sql`${pedidos.diaVenda} desc`)
    .limit(limite);

  let gravados = 0;
  for (const p of pendentes) {
    if (!p.shippingId) continue;
    try {
      const custo = await custoFreteVendedor(token, p.shippingId, conta.sellerId);
      await db
        .update(pedidos)
        .set({ freteVendedorCentavos: deReais(custo), atualizadoEm: new Date() })
        .where(eq(pedidos.id, p.id));
      gravados++;
    } catch (erro) {
      // Envio que não existe mais ou não é visível: registra zero para não travar a fila.
      if (erro instanceof MlErro && (erro.status === 404 || erro.status === 403)) {
        await db.update(pedidos).set({ freteVendedorCentavos: 0 }).where(eq(pedidos.id, p.id));
        continue;
      }
      throw erro;
    }
  }
  return { pendentes: pendentes.length, gravados };
}

/** Foto da reputação de hoje. */
export async function coletarReputacao(db: Db, conta: Conta, token: string) {
  const r = await buscarReputacao(token, conta.sellerId);
  const valores = {
    nivel: r.level_id ?? null,
    medalha: r.power_seller_status ?? null,
    reclamacoesTaxa: r.metrics?.claims?.rate ?? null,
    atrasosTaxa: r.metrics?.delayed_handling_time?.rate ?? null,
    cancelamentosTaxa: r.metrics?.cancellations?.rate ?? null,
    vendasPeriodo: r.metrics?.sales?.completed ?? null,
    avaliacoesPositivas: r.transactions?.ratings?.positive ?? null,
  };
  await db
    .insert(reputacaoDiaria)
    .values({ clienteId: conta.clienteId, contaId: conta.id, dia: diaLocal(), ...valores })
    .onConflictDoUpdate({
      target: [reputacaoDiaria.contaId, reputacaoDiaria.dia],
      set: { ...valores, atualizadoEm: new Date() },
    });
  return valores;
}

/**
 * Product Ads de um dia. Se a conta não tiver Product Ads ou a permissão de
 * publicidade não estiver liberada, marca a conta e não trava a fila.
 */
export async function coletarAds(db: Db, conta: Conta, token: string, dia: string) {
  let anunciante = conta.adsAdvertiserId;
  try {
    if (!anunciante) {
      anunciante = await buscarAnunciante(token);
      await db
        .update(tabelaContas)
        .set({ adsAdvertiserId: anunciante, adsStatus: anunciante ? "ok" : "sem_ads" })
        .where(eq(tabelaContas.id, conta.id));
      if (!anunciante) return { status: "sem_ads" as const, gravados: 0 };
    }
    const lista = await buscarMetricasAds(token, anunciante, dia);
    const linhas = lista.map((a) => ({
      clienteId: conta.clienteId,
      itemId: a.item_id,
      dia,
      cliques: a.metrics?.clicks ?? 0,
      impressoes: a.metrics?.prints ?? 0,
      custoCentavos: deReais(a.metrics?.cost ?? 0),
      receitaCentavos: deReais(a.metrics?.total_amount ?? 0),
      unidades: a.metrics?.units_quantity ?? 0,
    }));
    for (let i = 0; i < linhas.length; i += 200) {
      await db
        .insert(adsDiario)
        .values(linhas.slice(i, i + 200))
        .onConflictDoUpdate({
          target: [adsDiario.clienteId, adsDiario.itemId, adsDiario.dia],
          set: {
            cliques: excluido("cliques"),
            impressoes: excluido("impressoes"),
            custoCentavos: excluido("custo_centavos"),
            receitaCentavos: excluido("receita_centavos"),
            unidades: excluido("unidades"),
            atualizadoEm: sql`now()`,
          },
        });
    }
    if (conta.adsStatus !== "ok") {
      await db.update(tabelaContas).set({ adsStatus: "ok" }).where(eq(tabelaContas.id, conta.id));
    }
    return { status: "ok" as const, gravados: linhas.length };
  } catch (erro) {
    if (erro instanceof MlErro && (erro.status === 401 || erro.status === 403)) {
      await db
        .update(tabelaContas)
        .set({ adsStatus: "sem_permissao" })
        .where(eq(tabelaContas.id, conta.id));
      log.warn("Product Ads sem permissão", { contaId: conta.id, status: erro.status });
      return { status: "sem_permissao" as const, gravados: 0 };
    }
    throw erro;
  }
}
