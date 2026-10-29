import { mlEnviar, mlGet } from "./http";

/**
 * Central de promoções do vendedor (API seller-promotions, app_version=v2).
 * Os campos variam por tipo de campanha; o que não vier fica undefined.
 */
const V2 = { app_version: "v2" } as const;

export type MlPromocao = {
  id: string;
  type: string;
  sub_type?: string | null;
  status: string;
  name?: string | null;
  start_date?: string | null;
  finish_date?: string | null;
  deadline_date?: string | null;
  benefits?: { type?: string; meli_percent?: number; seller_percent?: number } | null;
};

export type MlPromocaoItem = {
  id: string;
  status: string;
  price?: number | null;
  original_price?: number | null;
  offer_id?: string | null;
  meli_percentage?: number | null;
  seller_percentage?: number | null;
  min_discounted_price?: number | null;
  max_discounted_price?: number | null;
  suggested_discounted_price?: number | null;
  start_date?: string | null;
  end_date?: string | null;
};

/** Tipos em que o vendedor só aceita a oferta que o ML montou (manda o offer_id). */
const POR_OFERTA = new Set([
  "SMART",
  "PRICE_MATCHING",
  "MARKETPLACE_CAMPAIGN",
  "UNHEALTHY_STOCK",
  "PRE_NEGOTIATED",
  "VOLUME",
]);
/** Tipos em que o vendedor escolhe o preço promocional (manda deal_price). */
const POR_PRECO = new Set(["DEAL", "SELLER_CAMPAIGN", "LIGHTNING", "DOD"]);

export const promocaoPedePreco = (tipo: string) => POR_PRECO.has(tipo);
export const promocaoSuportada = (tipo: string) => POR_PRECO.has(tipo) || POR_OFERTA.has(tipo);

export async function listarPromocoes(token: string, sellerId: string) {
  const todas: MlPromocao[] = [];
  for (let offset = 0; ; offset += 50) {
    const r = await mlGet<{ results: MlPromocao[]; paging?: { total?: number } }>(
      token,
      `/seller-promotions/users/${sellerId}`,
      { ...V2, limit: 50, offset },
    );
    todas.push(...r.results);
    if (r.results.length < 50 || todas.length >= (r.paging?.total ?? 0)) break;
  }
  return todas;
}

/** Itens da campanha (candidatos, pendentes e participando), página por cursor. */
export async function itensDaPromocao(token: string, promo: { id: string; type: string }) {
  const itens: MlPromocaoItem[] = [];
  let cursor: string | undefined;
  for (let pagina = 0; pagina < 40; pagina++) {
    const params: Record<string, string | number> = {
      ...V2,
      promotion_type: promo.type,
      limit: 50,
    };
    if (cursor) params.search_after = cursor;
    const r = await mlGet<{
      results: MlPromocaoItem[];
      paging?: { searchAfter?: string; search_after?: string; total?: number };
    }>(token, `/seller-promotions/promotions/${promo.id}/items`, params);
    itens.push(...r.results);
    cursor = r.paging?.searchAfter ?? r.paging?.search_after;
    if (!cursor || r.results.length === 0) break;
  }
  return itens;
}

/** Entra na campanha. Para tipos com preço, `precoReais` é o preço promocional. */
export function entrarNaPromocao(
  token: string,
  itemId: string,
  promo: { id: string; type: string },
  oferta: { offerId?: string | null; precoReais?: number | null },
) {
  const corpo: Record<string, unknown> = { promotion_id: promo.id, promotion_type: promo.type };
  if (POR_PRECO.has(promo.type)) {
    if (!oferta.precoReais) throw new Error("Informe o preço promocional.");
    corpo.deal_price = oferta.precoReais;
  } else if (oferta.offerId) {
    corpo.offer_id = oferta.offerId;
  }
  return mlEnviar<MlPromocaoItem>(token, "POST", `/seller-promotions/items/${itemId}`, corpo, V2);
}

export function sairDaPromocao(
  token: string,
  itemId: string,
  promo: { id: string; type: string },
  offerId?: string | null,
) {
  const params: Record<string, string> = {
    ...V2,
    promotion_type: promo.type,
    promotion_id: promo.id,
  };
  if (offerId) params.offer_id = offerId;
  return mlEnviar<unknown>(
    token,
    "DELETE",
    `/seller-promotions/items/${itemId}`,
    undefined,
    params,
  );
}

/** Desconto próprio do anúncio (até 31 dias, de 5% a 80%). Datas no formato 2026-11-01T00:00:00. */
export function criarDescontoProprio(
  token: string,
  itemId: string,
  d: { descontoPct: number; inicio: string; fim: string },
) {
  return mlEnviar<MlPromocaoItem>(
    token,
    "POST",
    `/seller-promotions/items/${itemId}`,
    {
      promotion_type: "PRICE_DISCOUNT",
      discount_percent: d.descontoPct,
      start_date: d.inicio,
      finish_date: d.fim,
    },
    V2,
  );
}

export function removerDescontoProprio(token: string, itemId: string) {
  return mlEnviar<unknown>(token, "DELETE", `/seller-promotions/items/${itemId}`, undefined, {
    ...V2,
    promotion_type: "PRICE_DISCOUNT",
  });
}

/**
 * Quanto do desconto o ML banca, em R$ por unidade. Os percentuais podem vir como
 * pontos do preço cheio (meli + vendedor = desconto total) ou como fatia do desconto.
 */
export function subsidioDoMl(item: MlPromocaoItem): number {
  const cheio = item.original_price ?? 0;
  const preco = item.price ?? cheio;
  const meli = item.meli_percentage ?? 0;
  if (!cheio || !meli) return 0;
  const descontoPct = (1 - preco / cheio) * 100;
  const somaPct = meli + (item.seller_percentage ?? 0);
  if (Math.abs(somaPct - descontoPct) < 1.5) return (cheio * meli) / 100;
  return ((cheio - preco) * meli) / 100;
}
