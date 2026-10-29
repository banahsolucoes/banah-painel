"use server";

import {
  criarDescontoProprio,
  entrarNaPromocao,
  mensagemDoErro,
  sairDaPromocao,
} from "@banah/connector-ml";
import { lerValorReais } from "@banah/core";
import { acoes, db } from "@banah/db";
import { diaLocal, diasEntre } from "@banah/shared";
import { redirect } from "next/navigation";
import { contaMl, NOME_PROMOCAO } from "@/lib/ml";
import { exigirAdmin } from "@/lib/sessao";

const ir = (destino: string, msg: string): never =>
  redirect(`${destino}${destino.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`);

/** Executa a chamada ao ML e registra em `acoes`, com sucesso ou erro. */
async function executar(
  p: {
    clienteId: string;
    autor: string;
    tipo: string;
    alvo: string;
    descricao: string;
    destino: string;
  },
  dados: Record<string, unknown>,
  chamada: (token: string) => Promise<unknown>,
) {
  const ml = await contaMl(p.clienteId).catch(() => null);
  if (!ml) return ir(p.destino, "Conta do Mercado Livre não conectada ou token inválido.");
  const registro = {
    clienteId: p.clienteId,
    agente: "humano",
    tipo: p.tipo,
    modoSeco: false,
    alvo: p.alvo,
    autor: p.autor,
  };
  try {
    await chamada(ml.token);
  } catch (e) {
    const erro = mensagemDoErro(e);
    await db()
      .insert(acoes)
      .values({ ...registro, status: "erro", dados: { ...dados, descricao: p.descricao, erro } });
    return ir(p.destino, `${p.alvo}: o Mercado Livre recusou. ${erro}`);
  }
  await db()
    .insert(acoes)
    .values({ ...registro, status: "ok", dados: { ...dados, descricao: p.descricao } });
  return ir(p.destino, `${p.alvo}: ${p.descricao} — feito.`);
}

function destinoDaCampanha(form: FormData) {
  const clienteId = String(form.get("clienteId") ?? "");
  const promoId = String(form.get("promoId") ?? "");
  const tipo = String(form.get("tipo") ?? "");
  const nome = String(form.get("nome") ?? "");
  return {
    clienteId,
    promo: { id: promoId, type: tipo },
    destino: `/clientes/${clienteId}/promocoes/${encodeURIComponent(promoId)}?tipo=${tipo}&nome=${encodeURIComponent(nome)}`,
    nomeCampanha: nome || NOME_PROMOCAO[tipo] || tipo,
  };
}

export async function entrarPromocao(form: FormData) {
  const sessao = await exigirAdmin();
  const { clienteId, promo, destino, nomeCampanha } = destinoDaCampanha(form);
  const itemId = String(form.get("itemId") ?? "");
  const offerId = String(form.get("offerId") ?? "") || null;
  const precoTexto = form.get("preco");
  const preco = precoTexto === null ? null : lerValorReais(String(precoTexto));
  if (precoTexto !== null && (preco === null || preco <= 0))
    return ir(destino, `${itemId}: preço promocional inválido.`);
  if (form.get("negativa") === "1" && form.get("confirmo") !== "on") {
    return ir(
      destino,
      `${itemId}: a margem fica negativa nesse preço. Marque "confirmo" para entrar mesmo assim.`,
    );
  }
  return executar(
    {
      clienteId,
      autor: sessao.email,
      tipo: "ml.promocao.entrar",
      alvo: itemId,
      descricao: `entrou em "${nomeCampanha}"${preco ? ` a ${(preco / 100).toFixed(2).replace(".", ",")}` : ""}`,
      destino,
    },
    { promocao: promo, precoCentavos: preco, offerId },
    (token) =>
      entrarNaPromocao(token, itemId, promo, { offerId, precoReais: preco ? preco / 100 : null }),
  );
}

export async function sairPromocao(form: FormData) {
  const sessao = await exigirAdmin();
  const { clienteId, promo, destino, nomeCampanha } = destinoDaCampanha(form);
  const itemId = String(form.get("itemId") ?? "");
  const offerId = String(form.get("offerId") ?? "") || null;
  return executar(
    {
      clienteId,
      autor: sessao.email,
      tipo: "ml.promocao.sair",
      alvo: itemId,
      descricao: `saiu de "${nomeCampanha}"`,
      destino,
    },
    { promocao: promo, offerId },
    (token) => sairDaPromocao(token, itemId, promo, offerId),
  );
}

export async function criarDesconto(form: FormData) {
  const sessao = await exigirAdmin();
  const clienteId = String(form.get("clienteId") ?? "");
  const destino = `/clientes/${clienteId}/promocoes`;
  const itemId = String(form.get("itemId") ?? "");
  const desconto = Number(form.get("desconto"));
  const inicio = String(form.get("inicio") ?? "");
  const fim = String(form.get("fim") ?? "");
  if (!Number.isFinite(desconto) || desconto < 5 || desconto > 80)
    return ir(destino, "O desconto precisa ficar entre 5% e 80%.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim))
    return ir(destino, "Datas inválidas.");
  if (inicio < diaLocal()) return ir(destino, "O início não pode ser no passado.");
  const dias = diasEntre(inicio, fim);
  if (dias < 0) return ir(destino, "O fim precisa ser depois do início.");
  if (dias > 30) return ir(destino, "O desconto próprio pode durar no máximo 31 dias.");
  return executar(
    {
      clienteId,
      autor: sessao.email,
      tipo: "ml.promocao.desconto",
      alvo: itemId,
      descricao: `desconto próprio de ${desconto}% de ${inicio.split("-").reverse().join("/")} a ${fim.split("-").reverse().join("/")}`,
      destino,
    },
    { desconto, inicio, fim },
    (token) =>
      criarDescontoProprio(token, itemId, {
        descontoPct: desconto,
        inicio: `${inicio}T00:00:00`,
        fim: `${fim}T23:59:59`,
      }),
  );
}
