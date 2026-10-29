"use server";

import {
  alterarPreco,
  buscarItemPreco,
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

  const item = await buscarItemPreco(token, itemId);
  const atual = deReais(item.price);
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
    .set({ precoCentavos: novoCentavos, atualizadoEm: sql`now()` })
    .where(and(eq(anuncios.clienteId, clienteId), eq(anuncios.itemId, itemId)));
  await db()
    .insert(acoes)
    .values({
      ...registro,
      status: "ok",
      dados: { de: atual, para: novoCentavos, sku: anuncio.sku, titulo: anuncio.titulo },
    });

  const fmt = (c: number) =>
    (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return voltar(destino, `${itemId}: preço alterado de ${fmt(atual)} para ${fmt(novoCentavos)}.`);
}
