import { buscarTarifa, obterAccessToken } from "@banah/connector-ml";
import { contasCanal, db } from "@banah/db";
import { deReais } from "@banah/shared";
import { and, eq } from "drizzle-orm";
import { chaveTokens, mlApp } from "./config";

/** Conta do Mercado Livre do cliente com token válido. null se não houver conta conectada. */
export async function contaMl(clienteId: string) {
  const conta = await db().query.contasCanal.findFirst({
    where: and(eq(contasCanal.clienteId, clienteId), eq(contasCanal.canal, "MELI")),
  });
  if (!conta) return null;
  const token = await obterAccessToken(db(), conta.id, mlApp(), chaveTokens());
  return { conta, token };
}

/**
 * Tarifa oficial do ML para vários preços, com cache e 5 consultas por vez.
 * Chave: preço em centavos | tipo | categoria | logística.
 */
export async function tarifasOficiais(
  token: string,
  pedidos: {
    precoCentavos: number;
    tipo: string | null;
    categoria: string | null;
    logistica: string | null;
  }[],
) {
  const resultado = new Map<string, number | null>();
  const chave = (p: (typeof pedidos)[number]) =>
    `${p.precoCentavos}|${p.tipo}|${p.categoria}|${p.logistica ?? ""}`;
  const unicos = [...new Map(pedidos.map((p) => [chave(p), p])).values()].filter(
    (p) => p.tipo && p.categoria && p.precoCentavos > 0,
  );
  for (let i = 0; i < unicos.length; i += 5) {
    await Promise.all(
      unicos.slice(i, i + 5).map(async (p) => {
        try {
          const t = await buscarTarifa(token, {
            preco: p.precoCentavos / 100,
            tipo: p.tipo as string,
            categoria: p.categoria as string,
            logistica: p.logistica,
          });
          resultado.set(
            chave(p),
            t.sale_fee_amount === undefined ? null : deReais(t.sale_fee_amount),
          );
        } catch {
          resultado.set(chave(p), null);
        }
      }),
    );
  }
  return (p: (typeof pedidos)[number]) => resultado.get(chave(p)) ?? null;
}

export const NOME_PROMOCAO: Record<string, string> = {
  DEAL: "Campanha tradicional",
  MARKETPLACE_CAMPAIGN: "Campanha do ML (coparticipação)",
  SMART: "Campanha automática (coparticipação)",
  PRICE_MATCHING: "Preço competitivo",
  PRICE_DISCOUNT: "Desconto próprio",
  VOLUME: "Desconto por volume",
  DOD: "Oferta do dia",
  LIGHTNING: "Oferta relâmpago",
  PRE_NEGOTIATED: "Desconto pré-negociado",
  SELLER_CAMPAIGN: "Campanha do vendedor",
  UNHEALTHY_STOCK: "Liquidação de estoque Full",
  SELLER_COUPON_CAMPAIGN: "Cupom do vendedor",
};

export const STATUS_ITEM_PROMO: Record<string, { rotulo: string; classe: string }> = {
  candidate: { rotulo: "Pode entrar", classe: "neutro" },
  pending: { rotulo: "Agendado", classe: "alerta" },
  started: { rotulo: "Participando", classe: "ok" },
  finished: { rotulo: "Encerrado", classe: "neutro" },
};

/** "2026-11-05T03:00:00Z" → "05/11 00:00" no horário de Brasília. */
export function dataHora(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
