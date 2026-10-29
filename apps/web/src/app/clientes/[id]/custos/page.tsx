import { anuncios, clientes, db, produtosCusto } from "@banah/db";
import { type Centavos, formatarReais } from "@banah/shared";
import { asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { BotaoEnviar } from "@/app/botao-enviar";
import { Navegacao } from "@/app/clientes/[id]/navegacao";
import { sessaoAtual } from "@/lib/sessao";
import { importarCustos } from "./actions";

export const dynamic = "force-dynamic";

export default async function Custos({
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

  const custos = await db().select().from(produtosCusto).where(eq(produtosCusto.clienteId, id));
  const porSku = new Map(custos.map((c) => [c.sku, c]));
  const lista = await db()
    .select()
    .from(anuncios)
    .where(eq(anuncios.clienteId, id))
    .orderBy(asc(anuncios.titulo));
  const ativos = lista.filter((a) => a.status !== "closed");
  const semCusto = ativos.filter((a) => !a.sku || !porSku.has(a.sku));

  return (
    <main style={{ maxWidth: 1100 }}>
      <Navegacao clienteId={id} nome={cliente.nome} atual="custos" />
      <h1>Custos dos produtos</h1>
      <p className="suave">
        {custos.length} SKUs com custo · {semCusto.length} de {ativos.length} anúncios ainda sem
        custo (a margem deles fica de fora)
      </p>

      {msg && <div className="aviso">{msg}</div>}

      <h2>Importar da planilha</h2>
      <p className="suave">
        Copie a tabela da planilha, com o cabeçalho, e cole aqui. Precisa ter as colunas{" "}
        <strong>SKU</strong> e <strong>Valor de Custo</strong>; as outras são ignoradas. SKU que já
        existe tem o custo atualizado.
      </p>
      <form action={importarCustos} style={{ display: "grid", gap: 12 }}>
        <input type="hidden" name="clienteId" value={id} />
        <textarea
          name="tabela"
          rows={10}
          required
          placeholder={
            "SKU\tStatus\tTítulo do anúncio\tValor de Custo\n400AA0101023\tAtivo\tKit 10 Barra Roscada 5/16\tR$ 34,00"
          }
        />
        <div>
          <BotaoEnviar enviando="Importando…">Importar custos</BotaoEnviar>
        </div>
      </form>

      <h2>Anúncios e custo ({ativos.length})</h2>
      <div className="tabela-rolagem">
        <table className="tabela">
          <thead>
            <tr>
              <th>Anúncio</th>
              <th>SKU</th>
              <th className="num">Preço</th>
              <th className="num">Custo</th>
              <th className="num">Custo / preço</th>
            </tr>
          </thead>
          <tbody>
            {ativos.map((a) => {
              const c = a.sku ? porSku.get(a.sku) : undefined;
              return (
                <tr key={a.itemId}>
                  <td>
                    <div className="titulo-anuncio">{a.titulo}</div>
                    <div className="suave pequeno">
                      {a.itemId}
                      {a.status !== "active" ? ` · ${a.status}` : ""}
                    </div>
                  </td>
                  <td>{a.sku ?? <span className="selo alerta">sem SKU</span>}</td>
                  <td className="num">{formatarReais(a.precoCentavos as Centavos)}</td>
                  <td className="num">
                    {c ? (
                      formatarReais(c.custoCentavos as Centavos)
                    ) : (
                      <span className="selo alerta">custo ausente</span>
                    )}
                  </td>
                  <td className="num">
                    {c && a.precoCentavos > 0
                      ? `${((c.custoCentavos / a.precoCentavos) * 100).toFixed(0)}%`
                      : "—"}
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
