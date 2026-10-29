import type { StatusEstoque } from "@banah/core";
import { notFound, redirect } from "next/navigation";
import { BotaoEnviar } from "@/app/botao-enviar";
import { Navegacao } from "@/app/clientes/[id]/navegacao";
import { carregarEstoque } from "@/lib/estoque";
import { sessaoAtual } from "@/lib/sessao";
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
const LOCAL: Record<string, string> = {
  FULL_ML: "Full ML",
  FULL_SHOPEE: "Full Shopee",
  PROPRIO: "Próprio",
};

const n0 = (v: number | null) => (v === null ? "—" : Math.round(v).toLocaleString("pt-BR"));
const n1 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export default async function Estoque({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/login");
  const { id } = await params;
  const { msg } = await searchParams;
  if (sessao.papel !== "admin" && sessao.clienteId !== id) notFound();

  const d = await carregarEstoque(id);
  if (!d) notFound();

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
              <th>Anúncio</th>
              <th>Local</th>
              <th className="num">Disponível</th>
              <th className="num">Venda/dia</th>
              <th className="num">Vendido 60d</th>
              <th className="num">Cobertura (dias)</th>
              <th className="num">Previsão 60d</th>
              <th className="num">Comprar</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {d.linhas.map((l) => (
              <tr key={l.itemId}>
                <td>
                  <div className="titulo-anuncio">
                    {l.permalink ? (
                      <a href={l.permalink} target="_blank" rel="noreferrer">
                        {l.titulo}
                      </a>
                    ) : (
                      l.titulo
                    )}
                  </div>
                  <div className="suave pequeno">
                    {l.itemId}
                    {l.sku ? ` · SKU ${l.sku}` : ""}
                    {l.statusAnuncio !== "active" ? ` · ${l.statusAnuncio}` : ""}
                  </div>
                </td>
                <td>
                  {l.local
                    .split("+")
                    .map((x) => LOCAL[x] ?? x)
                    .join(" + ")}
                </td>
                <td className="num">{n0(l.disponivel)}</td>
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
