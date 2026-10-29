import { calcularRecebimento, nomeTipoAnuncio } from "@banah/core";
import { acoes, anuncios, clientes, db, produtosCusto } from "@banah/db";
import { type Centavos, diaLocal, formatarReais, somarDias } from "@banah/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { BotaoEnviar } from "@/app/botao-enviar";
import { Navegacao } from "@/app/clientes/[id]/navegacao";
import { sessaoAtual } from "@/lib/sessao";
import { curto } from "@/lib/texto";
import { impostoDoCliente } from "@/lib/vendas";
import { salvarPreco } from "./actions";

export const dynamic = "force-dynamic";

const reais = (c: number | null | undefined) =>
  c === null || c === undefined ? "—" : formatarReais(c as Centavos);
const pct = (v: number | null) =>
  v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const precoTexto = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export default async function Precos({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; q?: string; confirmar?: string; valor?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/login");
  if (sessao.papel !== "admin") notFound();
  const { id } = await params;
  const { msg, q, confirmar, valor } = await searchParams;

  const cliente = await db().query.clientes.findFirst({ where: eq(clientes.id, id) });
  if (!cliente) notFound();

  const busca = (q ?? "").trim().toLowerCase();
  const lista = (
    await db()
      .select()
      .from(anuncios)
      .where(and(eq(anuncios.clienteId, id), eq(anuncios.status, "active")))
  )
    .filter(
      (a) =>
        !busca ||
        a.titulo.toLowerCase().includes(busca) ||
        a.itemId.toLowerCase().includes(busca) ||
        (a.sku ?? "").toLowerCase().includes(busca),
    )
    .sort((x, y) => (x.sku ?? "~").localeCompare(y.sku ?? "~") || x.titulo.localeCompare(y.titulo));

  const custos = new Map(
    (await db().select().from(produtosCusto).where(eq(produtosCusto.clienteId, id))).map((c) => [
      c.sku,
      c.custoCentavos,
    ]),
  );

  // Tarifa do ML em % do preço, média das vendas dos últimos 30 dias de cada anúncio.
  const tarifas = (await db().execute(sql`
    select pi.item_id,
      sum(pi.tarifa_unit_centavos * pi.quantidade)::float
        / nullif(sum(pi.preco_unit_centavos * pi.quantidade), 0) * 100 as tarifa_pct,
      sum(pi.quantidade)::int as unidades
    from pedido_itens pi
    join pedidos p on p.cliente_id = pi.cliente_id and p.order_id = pi.order_id
    where pi.cliente_id = ${id} and p.dia_venda >= ${somarDias(diaLocal(), -30)}
      and p.status not in ('cancelled', 'invalid') and pi.tarifa_unit_centavos is not null
    group by 1
  `)) as unknown as { item_id: string; tarifa_pct: number | null; unidades: number }[];
  const tarifaPorItem = new Map(tarifas.map((t) => [t.item_id, t]));

  const impostoPct = impostoDoCliente(cliente.config);

  const historico = await db()
    .select()
    .from(acoes)
    .where(and(eq(acoes.clienteId, id), eq(acoes.tipo, "ml.preco")))
    .orderBy(desc(acoes.criadoEm))
    .limit(20);

  return (
    <main style={{ maxWidth: 1200 }}>
      <Navegacao clienteId={id} nome={cliente.nome} atual="precos" />
      <h1>Preços</h1>
      <p className="suave">
        <strong>Preço cheio</strong> é o preço do anúncio sem promoção; é ele que se altera aqui.{" "}
        <strong>Comprador paga</strong> é o valor com a promoção ativa (no ML o cheio aparece
        riscado). <strong>Você recebe</strong> = comprador paga − tarifa do ML − frete que você paga
        (tabela oficial do ML). <strong>Margem</strong> = você recebe − custo − imposto. Antes de
        aplicar, o painel confere o preço no ML. Mudança de 30% para baixo ou 100% para cima pede
        confirmação.
      </p>

      {msg && <div className="aviso">{msg}</div>}

      <form className="linha" style={{ justifyContent: "flex-start", margin: "12px 0" }}>
        <input name="q" defaultValue={q ?? ""} placeholder="Buscar por título, SKU ou MLB" />
        <button type="submit" className="botao secundario">
          Buscar
        </button>
        {busca && <a href="?">✕ Limpar</a>}
      </form>

      <div className="tabela-rolagem">
        <table className="tabela">
          <thead>
            <tr>
              <th>Produto (SKU)</th>
              <th>Tipo</th>
              <th className="num">Preço cheio</th>
              <th className="num">Comprador paga</th>
              <th className="num">Tarifa ML</th>
              <th className="num">Frete</th>
              <th className="num">Você recebe</th>
              <th className="num">Custo</th>
              <th className="num">Margem</th>
              <th>Novo preço</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={11} className="suave">
                  Nenhum anúncio ativo encontrado.
                </td>
              </tr>
            )}
            {lista.map((a) => {
              const custo = a.sku ? (custos.get(a.sku) ?? null) : null;
              const t = tarifaPorItem.get(a.itemId);
              const pedeConfirmacao = confirmar === a.itemId;
              const cheio = a.precoCheioCentavos ?? a.precoCentavos;
              const emPromo = a.precoCentavos < cheio;
              // Tarifa oficial no preço de hoje; sem ela, a média real das vendas de 30 dias.
              const tarifa =
                a.tarifaCentavos ??
                (t?.tarifa_pct != null ? Math.round((a.precoCentavos * t.tarifa_pct) / 100) : null);
              const frete = a.freteGratis === false ? 0 : a.freteCustoCentavos;
              const r = calcularRecebimento({
                precoVendaCentavos: a.precoCentavos,
                tarifaCentavos: tarifa,
                freteCentavos: frete,
                custoCentavos: custo,
                impostoPct,
              });
              return (
                <tr key={a.itemId}>
                  <td>
                    <div className="titulo-anuncio" title={a.titulo}>
                      {a.permalink ? (
                        <a href={a.permalink} target="_blank" rel="noreferrer">
                          {curto(a.titulo)}
                        </a>
                      ) : (
                        curto(a.titulo)
                      )}
                    </div>
                    <div className="suave pequeno">
                      {a.sku ? `SKU ${a.sku} · ` : ""}
                      {a.itemId}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`selo ${a.tipoAnuncio === "gold_pro" ? "premium" : "classico"}`}
                    >
                      {nomeTipoAnuncio(a.tipoAnuncio)}
                    </span>
                    <div className="suave pequeno">
                      {[
                        a.catalogo ? "catálogo" : null,
                        a.logistica === "fulfillment" ? "Full" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </td>
                  <td className="num forte">{reais(cheio)}</td>
                  <td className="num">
                    {emPromo ? (
                      <>
                        <div className="forte">{reais(a.precoCentavos)}</div>
                        <span className="selo alerta" title={a.promocaoTipo ?? ""}>
                          promoção −{Math.round((1 - a.precoCentavos / cheio) * 100)}%
                        </span>
                      </>
                    ) : (
                      <span className="suave">mesmo</span>
                    )}
                  </td>
                  <td className="num">
                    {reais(tarifa)}
                    {tarifa !== null && a.precoCentavos > 0 && (
                      <div className="suave pequeno">{pct((tarifa / a.precoCentavos) * 100)}</div>
                    )}
                  </td>
                  <td className="num">
                    {a.freteGratis === false ? (
                      <span className="suave">comprador</span>
                    ) : (
                      reais(frete)
                    )}
                  </td>
                  <td className="num forte destaque-recebe">{reais(r.recebeCentavos)}</td>
                  <td className="num">{reais(custo)}</td>
                  <td className="num">
                    {r.margemCentavos === null ? (
                      <span className="suave pequeno">
                        {custo === null ? "sem custo" : impostoPct === null ? "sem imposto" : "—"}
                      </span>
                    ) : (
                      <span className={r.margemCentavos < 0 ? "negativo" : "positivo"}>
                        {reais(r.margemCentavos)}
                        <div className="pequeno">{pct(r.margemPct)}</div>
                      </span>
                    )}
                  </td>
                  <td>
                    <form action={salvarPreco} className="form-preco">
                      <input type="hidden" name="clienteId" value={id} />
                      <input type="hidden" name="itemId" value={a.itemId} />
                      <input
                        name="preco"
                        inputMode="decimal"
                        required
                        defaultValue={
                          pedeConfirmacao && valor
                            ? valor
                            : precoTexto(a.precoCheioCentavos ?? a.precoCentavos)
                        }
                        aria-label={`Novo preço de ${a.itemId}`}
                      />
                      {pedeConfirmacao && (
                        <label className="confirmo">
                          <input type="checkbox" name="confirmo" /> confirmo
                        </label>
                      )}
                      <BotaoEnviar enviando="…">Aplicar</BotaoEnviar>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Últimas alterações</h2>
      {historico.length === 0 ? (
        <p className="suave">Nenhuma alteração de preço feita pelo painel ainda.</p>
      ) : (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Anúncio</th>
                <th className="num">De</th>
                <th className="num">Para</th>
                <th>Quem</th>
                <th>Quando</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((h) => {
                const dados = h.dados as {
                  de?: number;
                  para?: number;
                  titulo?: string;
                  erro?: string;
                };
                return (
                  <tr key={h.id}>
                    <td>
                      <div className="titulo-anuncio">{curto(dados.titulo ?? h.alvo ?? "")}</div>
                      <div className="suave pequeno">{h.alvo}</div>
                    </td>
                    <td className="num">{reais(dados.de)}</td>
                    <td className="num">{reais(dados.para)}</td>
                    <td>{h.autor}</td>
                    <td>{h.criadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                    <td>
                      {h.status === "ok" ? (
                        <span className="selo ok">aplicado</span>
                      ) : (
                        <span className="selo erro" title={dados.erro}>
                          recusado
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
