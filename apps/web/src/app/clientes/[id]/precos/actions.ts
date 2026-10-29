"use server";

import {
  alterarPreco,
  buscarItemPreco,
  buscarPrecoVenda,
  mensagemDoErro,
  obterAccessToken,
} from "@banah/connector-ml";
import { checarNovoPreco, lerValorReais } from "@banah/core";
import { acoes, anuncios, db } from "@banah/db";
import { deReais } from "@banah/shared";
import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { chaveTokens, mlApp } from "@/lib/config";
import { exigirAdmin } from "@/lib/sessao";

const voltar = (destino: string, msg: string, extra = ""): never =>
  redirect(`${destino}?msg=${encodeURIComponent(msg)}${extra}`);

/**
 * Troca o preço de um anúncio no Mercado Livre.
 * Confere o preço atual direto no ML antes (o painel pode estar defasado), aplica a
 * trava de variação grande e registra tudo em `acoes`, inclusive quando dá erro.
 */
export async function salvarPreco(form: FormData) {
  const sessao = await exigirAdmin();
  const clienteId = String(form.get("clienteId") ?? "");
  const itemId = String(form.get("itemId") ?? "");
  const destino = `/clientes/${clienteId}/precos`;
  const novo = lerValorReais(String(form.get("preco") ?? ""));
  const confirmado = form.get("confirmo") === "on";

  const anuncio = await db().query.anuncios.findFirst({
    where: and(eq(anuncios.clienteId, clienteId), eq(anuncios.itemId, itemId)),
  });
  if (!anuncio) return voltar(destino, "Anúncio não encontrado.");

  let token: string;
  try {
    token = await obterAccessToken(db(), anuncio.contaId, mlApp(), chaveTokens());
  } catch (e) {
    return voltar(destino, `Não consegui falar com o Mercado Livre: ${mensagemDoErro(e)}`);
  }

  // O preço que se altera é o CHEIO. Com promoção ativa, item.price é o promocional,
  // então o cheio vem do regular_amount do preço de venda.
  const item = await buscarItemPreco(token, itemId);
  const venda = await buscarPrecoVenda(token, itemId).catch(() => null);
  const atual = deReais(venda?.regular_amount ?? item.original_price ?? item.price);
  const promocional = venda?.regular_amount ? deReais(venda.amount) : null;
  const checagem = checarNovoPreco(atual, novo, confirmado);
  if (!checagem.ok) {
    return voltar(
      destino,
      `${itemId}: ${checagem.motivo}`,
      checagem.precisaConfirmar
        ? `&confirmar=${itemId}&valor=${encodeURIComponent(String(form.get("preco")))}`
        : "",
    );
  }
  const novoCentavos = novo as number;

  const registro = {
    clienteId,
    agente: "humano",
    tipo: "ml.preco",
    modoSeco: false,
    alvo: itemId,
    autor: sessao.email,
  };
  try {
    await alterarPreco(token, item, novoCentavos / 100);
  } catch (e) {
    const motivo = mensagemDoErro(e);
    await db()
      .insert(acoes)
      .values({
        ...registro,
        status: "erro",
        dados: { de: atual, para: novoCentavos, erro: motivo },
      });
    return voltar(destino, `${itemId}: o Mercado Livre recusou. ${motivo}`);
  }

  await db()
    .update(anuncios)
    .set({
      precoCheioCentavos: novoCentavos,
      // Sem promoção, o comprador passa a pagar o preço novo; com promoção, o ML recalcula
      // e a próxima coleta traz o valor certo.
      ...(promocional === null ? { precoCentavos: novoCentavos } : {}),
      atualizadoEm: sql`now()`,
    })
    .where(and(eq(anuncios.clienteId, clienteId), eq(anuncios.itemId, itemId)));
  await db()
    .insert(acoes)
    .values({
      ...registro,
      status: "ok",
      dados: {
        de: atual,
        para: novoCentavos,
        sku: anuncio.sku,
        titulo: anuncio.titulo,
        promocional,
      },
    });

  const fmt = (c: number) =>
    (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const avisoPromo =
    promocional === null
      ? ""
      : novoCentavos <= promocional
        ? " Atenção: o preço cheio ficou abaixo do promocional, o ML tira o anúncio da promoção."
        : " O anúncio continua na promoção; o ML recalcula o desconto.";
  return voltar(
    destino,
    `${itemId}: preço cheio alterado de ${fmt(atual)} para ${fmt(novoCentavos)}.${avisoPromo}`,
  );
}
