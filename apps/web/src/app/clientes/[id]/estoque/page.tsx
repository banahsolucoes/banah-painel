import type { StatusEstoque } from "@banah/core";
import { notFound, redirect } from "next/navigation";
import { BotaoEnviar } from "@/app/botao-enviar";
import { Navegacao } from "@/app/clientes/[id]/navegacao";
import { carregarEstoque, type LinhaEstoque } from "@/lib/estoque";
import { sessaoAtual } from "@/lib/sessao";
import { curto } from "@/lib/texto";
import { salvarConfigEstoque } from "./actions";

export const dynamic = "force-dynamic";

const ROTULO: Record<StatusEstoque, string> = {
  ruptura_iminente: "Ruptura",
  comprar: "Comprar",
  ok: "OK",
  excesso: "Excesso",
  parado: "Parado",
  sem_dados: "Sem dados",
};
const CLASSE: Record<StatusEstoque, string> = {
  ruptura_iminente: "erro",
  comprar: "alerta",
  ok: "ok",
  excesso: "neutro",
  parado: "neutro",
  sem_dados: "neutro",
};
/** Colunas ordenáveis: clique no cabeçalho alterna crescente/decrescente. */
const COLUNAS = {
  titulo: { rotulo: "Produto (SKU)", num: false, valor: (l: LinhaEstoque) => l.titulo },
  ativo: { rotulo: "Ativo (dias)", num: true, valor: (l: LinhaEstoque) => l.diasAtivo },
  full: { rotulo: "Estoque Full", num: true, valor: (l: LinhaEstoque) => l.unidadesFullMl },
  proprio: { rotulo: "Estoque próprio", num: true, valor: (l: LinhaEstoque) => l.unidadesProprio },
  total: { rotulo: "Total", num: true, valor: (l: LinhaEstoque) => l.disponivel },
  venda: {
    rotulo: "Venda/dia",
    num: true,
    valor: (l: LinhaEstoque) => (l.diasHistorico > 0 ? l.vendaMediaDiaria : null),
  },
  vendido: { rotulo: "Vendido 60d", num: true, valor: (l: LinhaEstoque) => l.vendido60d },
  cobertura: { rotulo: "Cobertura (dias)", num: true, valor: (l: LinhaEstoque) => l.coberturaDias },
  previsao: { rotulo: "Previsão 60d", num: true, valor: (l: LinhaEstoque) => l.previsao60d },
  comprar: { rotulo: "Comprar", num: true, valor: (l: LinhaEstoque) => l.sugestaoCompra },
  situacao: { rotulo: "Situação", num: false, valor: (l: LinhaEstoque) => ORDEM_STATUS[l.status] },
} as const;
type Coluna = keyof typeof COLUNAS;
const ORDEM_STATUS: Record<StatusEstoque, number> = {
  ruptura_iminente: 0,
  comprar: 1,
  ok: 2,
  excesso: 3,
  parado: 4,
  sem_dados: 5,
};

function ordenar(linhas: LinhaEstoque[], col: Coluna | undefined, dir: "asc" | "desc") {
  if (!col) return linhas; // padrão: urgência (situação + cobertura)
  const f = COLUNAS[col].valor as (l: LinhaEstoque) => string | number | null;
  const sinal = dir === "asc" ? 1 : -1;
  return [...linhas].sort((a, b) => {
    const x = f(a);
    const y = f(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1; // vazio sempre no fim
    if (y === null) return -1;
    if (typeof x === "string" || typeof y === "string")
      return String(x).localeCompare(String(y), "pt-BR") * sinal;
    return (x - y) * sinal;
  });
}

function Cabecalho({ c, col, dir }: { c: Coluna; col: Coluna | undefined; dir: "asc" | "desc" }) {
  const ativa = col === c;
  const proxima = ativa && dir === "desc" ? "asc" : "desc";
  return (
    <th className={COLUNAS[c].num ? "num" : undefined}>
      <a className={ativa ? "ordenar ativa" : "ordenar"} href={`?o=${c}&d=${proxima}`}>
        {COLUNAS[c].rotulo}
        <span className="seta">{ativa ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </a>
    </th>
  );
}

const n0 = (v: number | null) => (v === null ? "—" : Math.round(v).toLocaleString("pt-BR"));
const n1 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export default async function Estoque({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; o?: string; d?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/login");
  const { id } = await params;
  const { msg, o, d: dirParam } = await searchParams;
  const col = o && o in COLUNAS ? (o as Coluna) : undefined;
  const dir = dirParam === "asc" ? "asc" : "desc";
  if (sessao.papel !== "admin" && sessao.clienteId !== id) notFound();

  const d = await carregarEstoque(id);
  if (!d) notFound();

  const linhas = ordenar(d.linhas, col, dir);
  const contagem = d.linhas.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main style={{ maxWidth: 1200 }}>
      <Navegacao clienteId={id} nome={d.cliente.nome} atual="estoque" />
      <h1>Estoque e previsão 60 dias</h1>
      <p className="suave">
        {d.ultimaFoto
          ? `Foto do estoque de ${d.ultimaFoto.split("-").reverse().join("/")}`
          : "Aguardando a primeira coleta"}{" "}
        · reposição {d.cfg.prazoReposicaoDias} dias · segurança {d.cfg.segurancaDias} dias
      </p>

      {msg && <div className="aviso">{msg}</div>}

      {!d.cargaCompleta && (
        <div className="aviso">
          Carga inicial em andamento: {d.janelasCarga} de 7 janelas de pedidos coletadas. A previsão
          aparece quando terminar. Até lá, a tabela mostra só o estoque.
        </div>
      )}
      {d.janelasComDiferenca > 0 && (
        <div className="aviso" style={{ borderLeftColor: "var(--erro)" }}>
          {d.janelasComDiferenca} janela(s) de pedidos com diferença entre o Mercado Livre e o
          banco. A previsão pode estar incompleta.
        </div>
      )}

      <div className="resumo secao tom-estoque">
        {(["ruptura_iminente", "comprar", "ok", "excesso", "parado"] as StatusEstoque[]).map(
          (s) => (
            <div key={s} className={`cartao resumo-item ${CLASSE[s]}`}>
              <span className="resumo-num">{contagem[s] ?? 0}</span>
              <span>{ROTULO[s]}</span>
            </div>
          ),
        )}
        {d.cfg.capacidadeFullMl !== null && (
          <div className="cartao resumo-item">
            <span className="resumo-num">
              {n0(d.unidadesFull)} / {n0(d.cfg.capacidadeFullMl)}
            </span>
            <span>Unidades no Full ML</span>
          </div>
        )}
      </div>

      <div className="tabela-rolagem">
        <table className="tabela">
          <thead>
            <tr>
              {(Object.keys(COLUNAS) as Coluna[]).map((c) => (
                <Cabecalho key={c} c={c} col={col} dir={dir} />
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.itemId}>
                <td>
                  <div className="titulo-anuncio" title={l.titulo}>
                    {l.permalink ? (
                      <a href={l.permalink} target="_blank" rel="noreferrer">
                        {curto(l.titulo)}
                      </a>
                    ) : (
                      curto(l.titulo)
                    )}
                  </div>
                  <div className="suave pequeno">
                    {l.sku ? `SKU ${l.sku} · ` : ""}
                    {l.itens.length > 1 ? `${l.itens.length} anúncios: ` : ""}
                    {l.itens.map((it, i) => (
                      <span key={it.itemId}>
                        {i > 0 && ", "}
                        {it.permalink ? (
                          <a href={it.permalink} target="_blank" rel="noreferrer">
                            {it.itemId}
                          </a>
                        ) : (
                          it.itemId
                        )}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="num">{n0(l.diasAtivo)}</td>
                <td className="num">{n0(l.unidadesFullMl)}</td>
                <td className="num">{n0(l.unidadesProprio)}</td>
                <td className="num forte">{n0(l.disponivel)}</td>
                <td className="num">{l.diasHistorico > 0 ? n1(l.vendaMediaDiaria) : "—"}</td>
                <td className="num">{n0(l.vendido60d)}</td>
                <td className="num">{n0(l.coberturaDias)}</td>
                <td className="num">{n0(l.previsao60d)}</td>
                <td className="num forte">{l.sugestaoCompra ? n0(l.sugestaoCompra) : "—"}</td>
                <td>
                  <span className={`selo ${CLASSE[l.status]}`}>{ROTULO[l.status]}</span>
                  {l.confianca === "baixa" && <div className="suave pequeno">confiança baixa</div>}
                  {l.confianca === "coletando" && l.diasHistorico > 0 && (
                    <div className="suave pequeno">coletando · {l.diasHistorico} de 30 dias</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sessao.papel === "admin" && (
        <>
          <h2>Parâmetros do cliente</h2>
          <form
            action={salvarConfigEstoque}
            className="linha"
            style={{ justifyContent: "flex-start" }}
          >
            <input type="hidden" name="clienteId" value={id} />
            <label>
              Reposição (dias)
              <input
                name="prazoReposicaoDias"
                type="number"
                min={1}
                defaultValue={d.cfg.prazoReposicaoDias}
              />
            </label>
            <label>
              Segurança (dias)
              <input
                name="segurancaDias"
                type="number"
                min={0}
                defaultValue={d.cfg.segurancaDias}
              />
            </label>
            <label>
              Capacidade do Full ML (unidades)
              <input
                name="capacidadeFullMl"
                type="number"
                min={0}
                placeholder="sem limite"
                defaultValue={d.cfg.capacidadeFullMl ?? ""}
              />
            </label>
            <BotaoEnviar>Salvar</BotaoEnviar>
          </form>
        </>
      )}
    </main>
  );
}
