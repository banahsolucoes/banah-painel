import { listarPromocoes, type MlPromocao, mensagemDoErro } from "@banah/connector-ml";
import { acoes, anuncios, clientes, db } from "@banah/db";
import { and, desc, eq, like } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { BotaoEnviar } from "@/app/botao-enviar";
import { Navegacao } from "@/app/clientes/[id]/navegacao";
import { contaMl, dataHora, NOME_PROMOCAO } from "@/lib/ml";
import { sessaoAtual } from "@/lib/sessao";
import { curto } from "@/lib/texto";
import { criarDesconto } from "./actions";

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
  let erro: string | null = null;
  try {
    const ml = await contaMl(id);
    if (!ml) erro = "Conta do Mercado Livre não conectada.";
    else promocoes = await listarPromocoes(ml.token, ml.conta.sellerId);
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
              <span className="pequeno">
                {dataHora(p.start_date)} até {dataHora(p.finish_date)}
              </span>
              {p.deadline_date && (
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
