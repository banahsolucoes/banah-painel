import { listarPromocoes, type MlPromocao, mensagemDoErro } from "@banah/connector-ml";
import { acoes, anuncios, clientes, db } from "@banah/db";
import { type Centavos, formatarReais } from "@banah/shared";
import { and, desc, eq, like } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { BotaoEnviar } from "@/app/botao-enviar";
import { Navegacao } from "@/app/clientes/[id]/navegacao";
import { CAMPANHA_CONTINUA, contaMl, dataHora, NOME_PROMOCAO } from "@/lib/ml";
import { carregarEmPromocao, type LinhaEmPromocao } from "@/lib/promocoes";
import { sessaoAtual } from "@/lib/sessao";
import { curto } from "@/lib/texto";
import { impostoDoCliente } from "@/lib/vendas";
import { criarDesconto, sairPromocao } from "./actions";

const reais = (c: number | null | undefined) =>
  c === null || c === undefined ? "—" : formatarReais(c as Centavos);

export const dynamic = "force-dynamic";

const STATUS_PROMO: Record<string, string> = {
  started: "Em andamento",
  pending: "Programada",
  candidate: "Convite",
  finished: "Encerrada",
};

export default async function Promocoes({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/login");
  if (sessao.papel !== "admin") notFound();
  const { id } = await params;
  const { msg } = await searchParams;
  const cliente = await db().query.clientes.findFirst({ where: eq(clientes.id, id) });
  if (!cliente) notFound();

  let promocoes: MlPromocao[] = [];
  let emPromocao: LinhaEmPromocao[] = [];
  let erro: string | null = null;
  try {
    const ml = await contaMl(id);
    if (!ml) erro = "Conta do Mercado Livre não conectada.";
    else {
      promocoes = await listarPromocoes(ml.token, ml.conta.sellerId);
      emPromocao = await carregarEmPromocao(
        id,
        ml.token,
        promocoes,
        impostoDoCliente(cliente.config),
      );
    }
  } catch (e) {
    erro = mensagemDoErro(e);
  }
  const abertas = promocoes
    .filter((p) => p.status !== "finished")
    .sort((a, b) =>
      (a.deadline_date ?? a.finish_date ?? "").localeCompare(
        b.deadline_date ?? b.finish_date ?? "",
      ),
    );

  const ativos = await db()
    .select({ itemId: anuncios.itemId, titulo: anuncios.titulo, sku: anuncios.sku })
    .from(anuncios)
    .where(and(eq(anuncios.clienteId, id), eq(anuncios.status, "active")))
    .orderBy(anuncios.titulo);

  const historico = await db()
    .select()
    .from(acoes)
    .where(and(eq(acoes.clienteId, id), like(acoes.tipo, "ml.promocao%")))
    .orderBy(desc(acoes.criadoEm))
    .limit(20);

  return (
    <main style={{ maxWidth: 1200 }}>
      <Navegacao clienteId={id} nome={cliente.nome} atual="promocoes" />
      <h1>Central de promoções</h1>
      <p className="suave">
        Campanhas em que a conta pode entrar ou já participa. Abra uma campanha para ver os
        anúncios, quanto você recebe e a margem no preço promocional antes de entrar.
      </p>
      {msg && <div className="aviso">{msg}</div>}
      {erro && (
        <div className="aviso" style={{ borderLeftColor: "var(--erro)" }}>
          Não consegui ler as promoções: {erro}. Confira se o app tem a permissão de Promoções no
          DevCenter e reconecte a conta.
        </div>
      )}

      <section className="secao tom-resultado">
        <h2>Em promoção agora ({emPromocao.length})</h2>
        {emPromocao.length === 0 && !erro && (
          <p className="suave">Nenhum anúncio com promoção ativa agora.</p>
        )}
        {emPromocao.length > 0 && (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Produto (SKU)</th>
                  <th>Campanha</th>
                  <th className="num">Preço cheio</th>
                  <th className="num">Preço promo</th>
                  <th className="num">Desconto</th>
                  <th className="num">ML banca</th>
                  <th className="num">Você recebe</th>
                  <th className="num">Margem</th>
                  <th>Até</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {emPromocao.map((l) => (
                  <tr key={`${l.itemId}-${l.promoId}-${l.offerId ?? ""}`}>
                    <td>
                      <div className="titulo-anuncio" title={l.titulo}>
                        {curto(l.titulo)}
                      </div>
                      <div className="suave pequeno">
                        {l.sku ? `SKU ${l.sku} · ` : ""}
                        {l.itemId}
                      </div>
                    </td>
                    <td>
                      <div>{l.campanha || NOME_PROMOCAO[l.tipo] || l.tipo}</div>
                      <div className="suave pequeno">{NOME_PROMOCAO[l.tipo] ?? l.tipo}</div>
                    </td>
                    <td className="num">{reais(l.cheioCentavos)}</td>
                    <td className="num forte">{reais(l.promoCentavos)}</td>
                    <td className="num">
                      {l.cheioCentavos > 0
                        ? `${Math.round((1 - l.promoCentavos / l.cheioCentavos) * 100)}%`
                        : "—"}
                    </td>
                    <td className="num">
                      {l.subsidioCentavos > 0 ? reais(l.subsidioCentavos) : "—"}
                    </td>
                    <td className="num forte destaque-recebe">{reais(l.recebeCentavos)}</td>
                    <td className="num">
                      {l.margemCentavos === null ? (
                        <span className="suave pequeno">{l.semCusto ? "sem custo" : "—"}</span>
                      ) : (
                        <span className={l.margemCentavos < 0 ? "negativo" : "positivo"}>
                          {reais(l.margemCentavos)}
                          <div className="pequeno">
                            {l.margemPct?.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                          </div>
                        </span>
                      )}
                    </td>
                    <td>{dataHora(l.fim)}</td>
                    <td>
                      <form action={sairPromocao} className="form-preco">
                        <input type="hidden" name="clienteId" value={id} />
                        <input type="hidden" name="promoId" value={l.promoId} />
                        <input type="hidden" name="tipo" value={l.tipo} />
                        <input type="hidden" name="nome" value={l.campanha} />
                        <input type="hidden" name="itemId" value={l.itemId} />
                        <input type="hidden" name="offerId" value={l.offerId ?? ""} />
                        <input type="hidden" name="voltar" value="lista" />
                        <BotaoEnviar
                          enviando="…"
                          secundario
                          confirmar={`Tirar ${l.itemId} da promoção "${l.campanha || NOME_PROMOCAO[l.tipo] || l.tipo}"?`}
                        >
                          Sair
                        </BotaoEnviar>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="secao tom-ads">
        <h2>Campanhas ({abertas.length})</h2>
        {abertas.length === 0 && !erro && (
          <p className="suave">Nenhuma campanha disponível agora.</p>
        )}
        <div className="campanhas">
          {abertas.map((p) => (
            <a
              key={`${p.type}-${p.id}`}
              className="cartao campanha"
              href={`/clientes/${id}/promocoes/${encodeURIComponent(p.id)}?tipo=${p.type}&nome=${encodeURIComponent(p.name ?? "")}`}
            >
              <span className="suave pequeno">{NOME_PROMOCAO[p.type] ?? p.type}</span>
              <strong>{p.name ?? NOME_PROMOCAO[p.type] ?? p.id}</strong>
              {CAMPANHA_CONTINUA.has(p.type) || !p.start_date ? (
                <span className="pequeno">
                  Campanha contínua: cada oferta tem a própria data (veja dentro)
                </span>
              ) : (
                <span className="pequeno">
                  {dataHora(p.start_date)} até {dataHora(p.finish_date)}
                </span>
              )}
              {p.deadline_date && !CAMPANHA_CONTINUA.has(p.type) && (
                <span className="pequeno">Aderir até {dataHora(p.deadline_date)}</span>
              )}
              {p.benefits?.meli_percent ? (
                <span className="selo ok">ML banca {p.benefits.meli_percent}%</span>
              ) : null}
              <span className="selo neutro">{STATUS_PROMO[p.status] ?? p.status}</span>
            </a>
          ))}
        </div>
      </section>

      <section className="secao tom-ads">
        <h2>Criar desconto próprio</h2>
        <p className="suave pequeno">
          Desconto que você define num anúncio: de 5% a 80%, por até 31 dias. Se o preço cheio subir
          durante o desconto, o ML tira o desconto.
        </p>
        <form action={criarDesconto} className="linha" style={{ justifyContent: "flex-start" }}>
          <input type="hidden" name="clienteId" value={id} />
          <label>
            Anúncio
            <select name="itemId" required className="campo">
              {ativos.map((a) => (
                <option key={a.itemId} value={a.itemId}>
                  {a.sku ? `${a.sku} · ` : ""}
                  {curto(a.titulo, 50)} · {a.itemId}
                </option>
              ))}
            </select>
          </label>
          <label>
            Desconto (%)
            <input
              name="desconto"
              type="number"
              min={5}
              max={80}
              step={1}
              required
              style={{ minWidth: 0, width: 90 }}
            />
          </label>
          <label>
            Início
            <input name="inicio" type="date" required style={{ minWidth: 0 }} />
          </label>
          <label>
            Fim
            <input name="fim" type="date" required style={{ minWidth: 0 }} />
          </label>
          <BotaoEnviar enviando="Criando…">Criar desconto</BotaoEnviar>
        </form>
      </section>

      <h2>Últimas ações em promoções</h2>
      {historico.length === 0 ? (
        <p className="suave">Nenhuma ação feita pelo painel ainda.</p>
      ) : (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Anúncio</th>
                <th>Ação</th>
                <th>Quem</th>
                <th>Quando</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((h) => {
                const d = h.dados as { descricao?: string; erro?: string };
                return (
                  <tr key={h.id}>
                    <td>{h.alvo}</td>
                    <td>{d.descricao ?? h.tipo}</td>
                    <td>{h.autor}</td>
                    <td>{h.criadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                    <td>
                      {h.status === "ok" ? (
                        <span className="selo ok">feito</span>
                      ) : (
                        <span className="selo erro" title={d.erro}>
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
