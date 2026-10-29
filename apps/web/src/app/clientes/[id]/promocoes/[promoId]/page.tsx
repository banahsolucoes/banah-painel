import {
  itensDaPromocao,
  type MlPromocaoItem,
  mensagemDoErro,
  promocaoPedePreco,
  promocaoSuportada,
  subsidioDoMl,
} from "@banah/connector-ml";
import { calcularRecebimento, nomeTipoAnuncio } from "@banah/core";
import { anuncios, clientes, db, produtosCusto } from "@banah/db";
import { type Centavos, deReais, formatarReais } from "@banah/shared";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { BotaoEnviar } from "@/app/botao-enviar";
import { Navegacao } from "@/app/clientes/[id]/navegacao";
import { contaMl, dataHora, NOME_PROMOCAO, STATUS_ITEM_PROMO, tarifasOficiais } from "@/lib/ml";
import { sessaoAtual } from "@/lib/sessao";
import { curto } from "@/lib/texto";
import { impostoDoCliente } from "@/lib/vendas";
import { entrarPromocao, sairPromocao } from "../actions";

export const dynamic = "force-dynamic";

const reais = (c: number | null | undefined) =>
  c === null || c === undefined ? "—" : formatarReais(c as Centavos);
const pct = (v: number | null) =>
  v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const precoTexto = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const FILTROS = {
  todos: "Todos",
  candidate: "Podem entrar",
  started: "Participando",
  pending: "Agendados",
};

export default async function Campanha({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; promoId: string }>;
  searchParams: Promise<{ tipo?: string; nome?: string; msg?: string; f?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/login");
  if (sessao.papel !== "admin") notFound();
  const { id, promoId: promoBruto } = await params;
  const promoId = decodeURIComponent(promoBruto);
  const { tipo = "", nome = "", msg, f = "todos" } = await searchParams;
  const cliente = await db().query.clientes.findFirst({ where: eq(clientes.id, id) });
  if (!cliente) notFound();
  const promo = { id: promoId, type: tipo };
  const pedePreco = promocaoPedePreco(tipo);
  const suportada = promocaoSuportada(tipo);

  let itens: MlPromocaoItem[] = [];
  let erro: string | null = null;
  let token = "";
  try {
    const ml = await contaMl(id);
    if (!ml) erro = "Conta do Mercado Livre não conectada.";
    else {
      token = ml.token;
      itens = await itensDaPromocao(ml.token, promo);
    }
  } catch (e) {
    erro = mensagemDoErro(e);
  }

  const lista = await db().select().from(anuncios).where(eq(anuncios.clienteId, id));
  const porItem = new Map(lista.map((a) => [a.itemId, a]));
  const custos = new Map(
    (await db().select().from(produtosCusto).where(eq(produtosCusto.clienteId, id))).map((c) => [
      c.sku,
      c.custoCentavos,
    ]),
  );
  const impostoPct = impostoDoCliente(cliente.config);

  // Preço promocional de cada item: o atual se já participa; o sugerido se pode entrar.
  const linhas = itens.map((it) => {
    const a = porItem.get(it.id);
    const cheio =
      deReais(it.original_price ?? 0) || (a?.precoCheioCentavos ?? a?.precoCentavos ?? 0);
    const promoReais =
      it.status === "candidate" && pedePreco
        ? (it.suggested_discounted_price ?? it.max_discounted_price ?? it.price ?? null)
        : (it.price ?? null);
    return {
      it,
      a,
      cheio,
      promoCentavos: promoReais === null ? null : deReais(promoReais),
      subsidio: deReais(subsidioDoMl(it)),
    };
  });
  const tarifaDe = token
    ? await tarifasOficiais(
        token,
        linhas
          .filter((l) => l.promoCentavos !== null)
          .map((l) => ({
            precoCentavos: l.promoCentavos as number,
            tipo: l.a?.tipoAnuncio ?? null,
            categoria: l.a?.categoriaId ?? null,
            logistica: l.a?.logistica ?? null,
          })),
      )
    : () => null;

  const contagem = linhas.reduce<Record<string, number>>((acc, l) => {
    acc[l.it.status] = (acc[l.it.status] ?? 0) + 1;
    return acc;
  }, {});
  const visiveis = linhas.filter((l) => f === "todos" || l.it.status === f);
  const linkFiltro = (k: string) =>
    `?tipo=${tipo}&nome=${encodeURIComponent(nome)}${k === "todos" ? "" : `&f=${k}`}`;

  return (
    <main style={{ maxWidth: 1300 }}>
      <Navegacao clienteId={id} nome={cliente.nome} atual="promocoes" />
      <p>
        <a href={`/clientes/${id}/promocoes`}>← Todas as campanhas</a>
      </p>
      <h1>{nome || NOME_PROMOCAO[tipo] || promoId}</h1>
      <p className="suave">
        {NOME_PROMOCAO[tipo] ?? tipo} · {itens.length} anúncios.{" "}
        {pedePreco
          ? "Nesta campanha você escolhe o preço promocional, dentro do mínimo e máximo do ML."
          : "Nesta campanha o ML define o preço; você só aceita ou sai."}{" "}
        A margem considera o preço promocional, a parte que o ML banca, a tarifa oficial nesse
        preço, o frete, o custo e o imposto.
      </p>
      {msg && <div className="aviso">{msg}</div>}
      {erro && (
        <div className="aviso" style={{ borderLeftColor: "var(--erro)" }}>
          Não consegui ler a campanha: {erro}
        </div>
      )}
      {!suportada && (
        <div className="aviso" style={{ borderLeftColor: "var(--alerta)" }}>
          Este tipo de campanha ({tipo}) ainda não pode ser alterado pelo painel; só consulta.
        </div>
      )}

      <div className="abas" style={{ margin: "12px 0" }}>
        {Object.entries(FILTROS).map(([k, r]) => (
          <a key={k} href={linkFiltro(k)} className={f === k ? "aba ativa" : "aba"}>
            {r} ({k === "todos" ? linhas.length : (contagem[k] ?? 0)})
          </a>
        ))}
      </div>

      <div className="tabela-rolagem">
        <table className="tabela">
          <thead>
            <tr>
              <th>Produto (SKU)</th>
              <th>Situação</th>
              <th className="num">Preço cheio</th>
              <th className="num">Preço promo</th>
              <th className="num">Desconto</th>
              <th className="num">ML banca</th>
              <th className="num">Tarifa</th>
              <th className="num">Frete</th>
              <th className="num">Você recebe</th>
              <th className="num">Margem</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={11} className="suave">
                  Nenhum anúncio nesta visão.
                </td>
              </tr>
            )}
            {visiveis.map(({ it, a, cheio, promoCentavos, subsidio }) => {
              const tarifa =
                promoCentavos === null
                  ? null
                  : tarifaDe({
                      precoCentavos: promoCentavos,
                      tipo: a?.tipoAnuncio ?? null,
                      categoria: a?.categoriaId ?? null,
                      logistica: a?.logistica ?? null,
                    });
              const frete = a?.freteGratis === false ? 0 : (a?.freteCustoCentavos ?? null);
              const custo = a?.sku ? (custos.get(a.sku) ?? null) : null;
              const r =
                promoCentavos === null
                  ? null
                  : calcularRecebimento({
                      precoVendaCentavos: promoCentavos,
                      tarifaCentavos: tarifa,
                      freteCentavos: frete,
                      custoCentavos: custo,
                      impostoPct,
                    });
              const recebe = r?.recebeCentavos == null ? null : r.recebeCentavos + subsidio;
              const margem = r?.margemCentavos == null ? null : r.margemCentavos + subsidio;
              const margemPct =
                margem !== null && promoCentavos ? (margem / promoCentavos) * 100 : null;
              const negativa = margem !== null && margem < 0;
              const st = STATUS_ITEM_PROMO[it.status] ?? { rotulo: it.status, classe: "neutro" };
              const ocultos = (
                <>
                  <input type="hidden" name="clienteId" value={id} />
                  <input type="hidden" name="promoId" value={promoId} />
                  <input type="hidden" name="tipo" value={tipo} />
                  <input type="hidden" name="nome" value={nome} />
                  <input type="hidden" name="itemId" value={it.id} />
                  <input type="hidden" name="offerId" value={it.offer_id ?? ""} />
                </>
              );
              return (
                <tr key={it.id}>
                  <td>
                    <div className="titulo-anuncio" title={a?.titulo}>
                      {curto(a?.titulo ?? it.id)}
                    </div>
                    <div className="suave pequeno">
                      {a?.sku ? `SKU ${a.sku} · ` : ""}
                      {it.id} · {nomeTipoAnuncio(a?.tipoAnuncio)}
                    </div>
                  </td>
                  <td>
                    <span className={`selo ${st.classe}`}>{st.rotulo}</span>
                    {(it.start_date || it.end_date) && (
                      <div className="suave pequeno">
                        {it.start_date ? `${dataHora(it.start_date)} ` : ""}até{" "}
                        {dataHora(it.end_date)}
                      </div>
                    )}
                  </td>
                  <td className="num">{reais(cheio)}</td>
                  <td className="num forte">
                    {reais(promoCentavos)}
                    {pedePreco &&
                      it.status === "candidate" &&
                      (it.min_discounted_price || it.max_discounted_price) && (
                        <div className="suave pequeno">
                          {it.min_discounted_price ? reais(deReais(it.min_discounted_price)) : "?"}{" "}
                          a{" "}
                          {it.max_discounted_price ? reais(deReais(it.max_discounted_price)) : "?"}
                        </div>
                      )}
                  </td>
                  <td className="num">
                    {promoCentavos !== null && cheio > 0
                      ? pct((1 - promoCentavos / cheio) * 100)
                      : "—"}
                  </td>
                  <td className="num">{subsidio > 0 ? reais(subsidio) : "—"}</td>
                  <td className="num">{reais(tarifa)}</td>
                  <td className="num">{a?.freteGratis === false ? "comprador" : reais(frete)}</td>
                  <td className="num forte destaque-recebe">{reais(recebe)}</td>
                  <td className="num">
                    {margem === null ? (
                      <span className="suave pequeno">
                        {!a
                          ? "anúncio não coletado"
                          : custo === null
                            ? "sem custo"
                            : impostoPct === null
                              ? "sem imposto"
                              : "—"}
                      </span>
                    ) : (
                      <span className={negativa ? "negativo" : "positivo"}>
                        {reais(margem)}
                        <div className="pequeno">{pct(margemPct)}</div>
                      </span>
                    )}
                  </td>
                  <td>
                    {!suportada ? (
                      <span className="suave pequeno">só consulta</span>
                    ) : it.status === "candidate" ? (
                      <form action={entrarPromocao} className="form-preco">
                        {ocultos}
                        <input type="hidden" name="negativa" value={negativa ? "1" : "0"} />
                        {pedePreco && (
                          <input
                            name="preco"
                            inputMode="decimal"
                            required
                            defaultValue={promoCentavos ? precoTexto(promoCentavos) : ""}
                            aria-label={`Preço promocional de ${it.id}`}
                          />
                        )}
                        {negativa && (
                          <label className="confirmo">
                            <input type="checkbox" name="confirmo" /> confirmo
                          </label>
                        )}
                        <BotaoEnviar enviando="…">Participar</BotaoEnviar>
                      </form>
                    ) : it.status === "started" || it.status === "pending" ? (
                      <form action={sairPromocao} className="form-preco">
                        {ocultos}
                        <BotaoEnviar enviando="…" confirmar={`Tirar ${it.id} desta campanha?`}>
                          Sair
                        </BotaoEnviar>
                      </form>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
