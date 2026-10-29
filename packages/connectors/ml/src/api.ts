import { mlGet, mlPaginar } from "./http";

/** Formato que o /orders/search aceita: 2026-10-01T00:00:00.000-00:00 */
export function dataMl(d: Date): string {
  return d.toISOString().replace("Z", "-00:00");
}

export type MlItem = {
  id: string;
  title: string;
  price: number;
  available_quantity: number;
  status: string;
  catalog_listing?: boolean;
  catalog_product_id?: string | null;
  permalink?: string;
  thumbnail?: string;
  date_created?: string;
  seller_custom_field?: string | null;
  attributes?: { id: string; value_name?: string | null }[];
  shipping?: { logistic_type?: string | null };
};

export type MlPedido = {
  id: number;
  pack_id?: number | null;
  status: string;
  total_amount: number;
  date_created: string;
  last_updated?: string;
  order_items: {
    item: { id: string; title?: string; seller_sku?: string | null; variation_id?: number | null };
    quantity: number;
    unit_price: number;
  }[];
};

/**
 * Todos os IDs de anúncio do vendedor (ativos, pausados e fechados recentes).
 * Usa search_type=scan, que não tem o teto de 1.000 resultados da paginação comum,
 * e confere a contagem final contra o total informado pela API.
 */
export async function listarIdsAnuncios(token: string, sellerId: string) {
  const ids: string[] = [];
  let scrollId: string | undefined;
  let total = 0;
  for (;;) {
    const params: Record<string, string | number> = { search_type: "scan", limit: 100 };
    if (scrollId) params.scroll_id = scrollId;
    const p = await mlGet<{ results: string[]; scroll_id?: string; paging: { total: number } }>(
      token,
      `/users/${sellerId}/items/search`,
      params,
    );
    total = p.paging.total;
    if (p.results.length === 0) break;
    ids.push(...p.results);
    scrollId = p.scroll_id;
    if (!scrollId || ids.length >= total) break;
  }
  const unicos = [...new Set(ids)];
  if (unicos.length !== total) {
    throw new Error(`Lista de anúncios incompleta: ${unicos.length} de ${total}`);
  }
  return unicos;
}

/** Detalhes em lotes de 20 (limite do multiget do ML). Item que voltar com erro derruba a coleta. */
export async function buscarAnuncios(token: string, ids: string[]): Promise<MlItem[]> {
  const itens: MlItem[] = [];
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20);
    const resp = await mlGet<{ code: number; body: MlItem }[]>(token, "/items", {
      ids: lote.join(","),
    });
    for (const r of resp) {
      if (r.code !== 200) throw new Error(`Anúncio ${r.body?.id ?? "?"} respondeu ${r.code}`);
      itens.push(r.body);
    }
  }
  return itens;
}

export function skuDoItem(item: MlItem): string | null {
  return (
    item.seller_custom_field ||
    item.attributes?.find((a) => a.id === "SELLER_SKU")?.value_name ||
    null
  );
}

/**
 * Pedidos de uma janela, filtrando por criação ou por última atualização.
 * Janelas curtas (até ~15 dias) mantêm cada busca bem abaixo dos limites da API.
 */
export function buscarPedidos(
  token: string,
  sellerId: string,
  janela: { campo: "date_created" | "date_last_updated"; de: Date; ate: Date },
) {
  return mlPaginar<MlPedido>(token, "/orders/search", {
    seller: sellerId,
    [`order.${janela.campo}.from`]: dataMl(janela.de),
    [`order.${janela.campo}.to`]: dataMl(janela.ate),
    sort: "date_asc",
  });
}
