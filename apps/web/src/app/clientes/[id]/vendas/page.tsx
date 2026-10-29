import { lerNivelReputacao } from "@banah/core";
import type { Centavos } from "@banah/shared";
import { notFound, redirect } from "next/navigation";
import { BotaoEnviar } from "@/app/botao-enviar";
import { Navegacao } from "@/app/clientes/[id]/navegacao";
import { sessaoAtual } from "@/lib/sessao";
import { carregarVendas, PERIODOS, type Periodo } from "@/lib/vendas";
import { salvarImposto } from "./actions";

export const dynamic = "force-dynamic";

const reais = (c: number | null) =>
  c === null
    ? "—"
    : ((c as Centavos) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number | null, casas = 1) =>
  v === null
    ? "—"
    : `${v.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas })}%`;
const num = (v: number | null) => (v === null ? "—" : v.toLocaleString("pt-BR"));
const dataBr = (d: string) => d.split("-").reverse().join("/");

/** Variação contra o período anterior. */
function Variacao({
  agora,
  antes,
  inverso = false,
}: {
  agora: number | null;
  antes: number | null;
  inverso?: boolean;
}) {
  if (agora === null || antes === null || antes === 0) return null;
  const v = ((agora - antes) / Math.abs(antes)) * 100;
  const bom = inverso ? v < 0 : v > 0;
  return (
    <span className={`variacao ${bom ? "ok" : "erro"}`}>
      {v > 0 ? "▲" : "▼"} {Math.abs(v).toFixed(0)}%
    </span>
  );
}

function Cartao({
  rotulo,
  valor,
  detalhe,
  children,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="cartao indicador">
      <span className="suave pequeno">{rotulo}</span>
      <span className="indicador-valor">{valor}</span>
      <span className="pequeno">
        {children} {detalhe && <span className="suave">{detalhe}</span>}
      </span>
    </div>
  );
}

export default async function Vendas({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string; msg?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/login");
  const { id } = await params;
  const { p, msg } = await searchParams;
  if (sessao.papel !== "admin" && sessao.clienteId !== id) notFound();

  const periodo: Periodo = p && p in PERIODOS ? (p as Periodo) : "hoje";
  const d = await carregarVendas(id, periodo);
  if (!d) notFound();

  const a = d.atual.indicadores;
  const b = d.anterior.indicadores;
  const rep = lerNivelReputacao(d.reputacao?.nivel ?? null);
  const fatSemCustoPct =
    a.faturamentoCentavos > 0
      ? (d.atual.lacunas.faturamentoSemCustoCentavos / a.faturamentoCentavos) * 100
      : 0;
  const maxFat = Math.max(1, ...d.serie.map((s) => Number(s.fat)));
  const periodoTexto =
    d.intervalo.de === d.intervalo.ate
      ? dataBr(d.intervalo.de)
      : `${dataBr(d.intervalo.de)} a ${dataBr(d.intervalo.ate)}`;

  return (
    <main style={{ maxWidth: 1200 }}>
      <Navegacao clienteId={id} nome={d.cliente.nome} atual="vendas" />

      <div className="linha">
        <h1>Vendas · {periodoTexto}</h1>
        <div className="abas">
          {(Object.keys(PERIODOS) as Periodo[]).map((k) => (
            <a key={k} href={`?p=${k}`} className={k === periodo ? "aba ativa" : "aba"}>
              {PERIODOS[k]}
            </a>
          ))}
        </div>
      </div>
      <p className="suave pequeno">Comparação com o período anterior de mesmo tamanho.</p>

      {msg && <div className="aviso">{msg}</div>}

      {d.adsStatus === "sem_permissao" && (
        <div className="aviso" style={{ borderLeftColor: "var(--alerta)" }}>
          Ads sem permissão: marque <strong>Publicidade</strong> nas permissões do app no DevCenter
          do Mercado Livre e reconecte a conta. Até lá, os indicadores de ads ficam zerados.
        </div>
      )}
      {d.impostoPct === null && (
        <div className="aviso" style={{ borderLeftColor: "var(--alerta)" }}>
          Alíquota de imposto não configurada: a margem não é calculada. Preencha no fim da página.
        </div>
      )}
      {fatSemCustoPct >= 1 && (
        <div className="aviso" style={{ borderLeftColor: "var(--alerta)" }}>
          {fatSemCustoPct.toFixed(0)}% do faturamento do período é de produtos sem custo cadastrado;
          a margem desses itens aparece maior do que é.{" "}
          <a href={`/clientes/${id}/custos`}>Cadastrar custos</a>
        </div>
      )}
      {(d.atual.lacunas.pedidosSemFrete > 0 || d.atual.lacunas.pedidosSemTarifa > 0) && (
        <p className="suave pequeno">
          Ainda calculando: {d.atual.lacunas.pedidosSemFrete} pedido(s) sem frete e{" "}
          {d.atual.lacunas.pedidosSemTarifa} sem tarifa. Os valores se completam nas próximas
          coletas.
        </p>
      )}

      <section className="secao tom-vendas">
        <h2>Vendas</h2>
        <div className="indicadores">
          <Cartao rotulo="Valor vendido" valor={reais(a.faturamentoCentavos)}>
            <Variacao agora={a.faturamentoCentavos} antes={b.faturamentoCentavos} />
          </Cartao>
          <Cartao rotulo="Pedidos" valor={num(a.pedidos)} detalhe={`${num(a.unidades)} unidades`}>
            <Variacao agora={a.pedidos} antes={b.pedidos} />
          </Cartao>
          <Cartao rotulo="Ticket médio" valor={reais(a.ticketMedioCentavos)}>
            <Variacao agora={a.ticketMedioCentavos} antes={b.ticketMedioCentavos} />
          </Cartao>
        </div>
      </section>

      <section className="secao tom-resultado">
        <h2>Resultado</h2>
        <div className="indicadores">
          <Cartao
            rotulo="Receita líquida"
            valor={reais(a.receitaLiquidaCentavos)}
            detalhe={`tarifas ${reais(d.atual.tarifasCentavos)} · frete ${reais(d.atual.freteCentavos)}`}
          />
          <Cartao
            rotulo="Margem"
            valor={
              a.margemCentavos === null ? "—" : `${reais(a.margemCentavos)} · ${pct(a.margemPct)}`
            }
            detalhe={
              a.impostoCentavos === null
                ? "configure o imposto"
                : `custo ${reais(d.atual.custoCentavos)} · imposto ${reais(a.impostoCentavos)} · ads ${reais(a.adsCustoCentavos)}`
            }
          />
        </div>
      </section>

      <section className="secao tom-ads">
        <h2>Ads</h2>
        <div className="indicadores">
          <Cartao rotulo="Gasto com ads" valor={reais(a.adsCustoCentavos)}>
            <Variacao agora={a.adsCustoCentavos} antes={b.adsCustoCentavos} inverso />
          </Cartao>
          <Cartao rotulo="CPC" valor={reais(a.cpcCentavos)} detalhe={`CTR ${pct(a.ctrPct, 2)}`} />
          <Cartao
            rotulo="ROAS"
            valor={a.roas === null ? "—" : `${a.roas.toFixed(1)}x`}
            detalhe={`receita ads ${reais(a.adsReceitaCentavos)}`}
          />
          <Cartao rotulo="ACOS" valor={pct(a.acosPct)}>
            <Variacao agora={a.acosPct} antes={b.acosPct} inverso />
          </Cartao>
          <Cartao rotulo="TACOS" valor={pct(a.tacosPct)} detalhe="gasto ÷ faturamento total" />
        </div>
        {periodo === "hoje" && (
          <p className="suave pequeno">
            Ads de hoje são parciais: o Mercado Livre consolida as métricas por volta das 10h do dia
            seguinte.
          </p>
        )}
      </section>

      <section className="secao tom-reputacao">
        <h2>Reputação</h2>
        <div className="indicadores">
          <Cartao
            rotulo="Termômetro"
            valor={rep.rotulo}
            detalhe={d.reputacao?.medalha ? `MercadoLíder ${d.reputacao.medalha}` : undefined}
          >
            <span className={`selo ${rep.cor}`}>
              {d.reputacao ? `foto de ${dataBr(d.reputacao.dia_texto)}` : "aguardando coleta"}
            </span>
          </Cartao>
          <Cartao
            rotulo="Reclamações"
            valor={pct(
              d.reputacao?.reclamacoes_taxa != null ? d.reputacao.reclamacoes_taxa * 100 : null,
              2,
            )}
          />
          <Cartao
            rotulo="Atrasos no envio"
            valor={pct(
              d.reputacao?.atrasos_taxa != null ? d.reputacao.atrasos_taxa * 100 : null,
              2,
            )}
          />
          <Cartao
            rotulo="Cancelamentos"
            valor={pct(
              d.reputacao?.cancelamentos_taxa != null ? d.reputacao.cancelamentos_taxa * 100 : null,
              2,
            )}
          />
          <Cartao
            rotulo="Vendas no período do ML"
            valor={num(d.reputacao?.vendas_periodo ?? null)}
            detalhe="base do termômetro"
          />
        </div>
      </section>

      <h2>Anúncios do período</h2>
      <div className="tabela-rolagem">
        <table className="tabela">
          <thead>
            <tr>
              <th>Anúncio</th>
              <th className="num">Unidades</th>
              <th className="num">Vendido</th>
              <th className="num">Gasto ads</th>
              <th className="num">ACOS</th>
            </tr>
          </thead>
          <tbody>
            {d.top.length === 0 && (
              <tr>
                <td colSpan={5} className="suave">
                  Nenhuma venda nem ads no período.
                </td>
              </tr>
            )}
            {d.top.map((t) => (
              <tr key={t.item_id}>
                <td>
                  <div className="titulo-anuncio">{t.titulo ?? t.item_id}</div>
                  <div className="suave pequeno">
                    {t.item_id}
                    {t.sku ? ` · SKU ${t.sku}` : ""}
                  </div>
                </td>
                <td className="num">{num(t.unidades)}</td>
                <td className="num">{reais(Number(t.fat))}</td>
                <td className="num">{reais(Number(t.ads))}</td>
                <td className="num">
                  {Number(t.receita_ads) > 0
                    ? pct((Number(t.ads) / Number(t.receita_ads)) * 100)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Últimos 30 dias</h2>
      <div className="tabela-rolagem">
        <table className="tabela">
          <thead>
            <tr>
              <th>Dia</th>
              <th className="num">Pedidos</th>
              <th className="num">Vendido</th>
              <th style={{ width: "40%" }} />
              <th className="num">Gasto ads</th>
            </tr>
          </thead>
          <tbody>
            {d.serie.map((s) => (
              <tr key={s.dia}>
                <td>{dataBr(s.dia)}</td>
                <td className="num">{num(s.pedidos)}</td>
                <td className="num">{reais(Number(s.fat))}</td>
                <td>
                  <div className="barra" style={{ width: `${(Number(s.fat) / maxFat) * 100}%` }} />
                </td>
                <td className="num">{reais(Number(s.ads))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sessao.papel === "admin" && (
        <>
          <h2>Parâmetros</h2>
          <form
            action={salvarImposto}
            className="linha"
            style={{ justifyContent: "flex-start", alignItems: "end" }}
          >
            <input type="hidden" name="clienteId" value={id} />
            <label>
              Alíquota média de imposto (% sobre o faturamento)
              <input
                name="aliquotaImpostoPct"
                inputMode="decimal"
                placeholder="ex.: 9,25"
                defaultValue={d.impostoPct === null ? "" : String(d.impostoPct).replace(".", ",")}
              />
            </label>
            <BotaoEnviar>Salvar</BotaoEnviar>
          </form>
        </>
      )}
    </main>
  );
}
