import { mlEnviar, mlGet } from "./http";

export type MlItemPreco = {
  id: string;
  price: number;
  original_price?: number | null;
  status: string;
  variations?: { id: number; price: number }[];
};

export function buscarItemPreco(token: string, itemId: string) {
  return mlGet<MlItemPreco>(token, `/items/${itemId}`, {
    attributes: "id,price,original_price,status,variations",
  });
}

/**
 * Troca o preço do anúncio. Com variações, o ML exige o preço em cada variação
 * (todas com o mesmo valor); sem variações, vai no próprio item.
 */
export async function alterarPreco(token: string, item: MlItemPreco, precoReais: number) {
  const corpo = item.variations?.length
    ? { variations: item.variations.map((v) => ({ id: v.id, price: precoReais })) }
    : { price: precoReais };
  return mlEnviar<MlItemPreco>(token, "PUT", `/items/${item.id}`, corpo);
}
