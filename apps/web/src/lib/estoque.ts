import { analisarEstoque, type ResultadoEstoque, type StatusEstoque } from "@banah/core";
import { anuncios, clientes, conferencias, db } from "@banah/db";
import { diaLocal, diasEntre, somarDias } from "@banah/shared";
import { and, eq, like, sql } from "drizzle-orm";

export type ConfigEstoque = {
  prazoReposicaoDias: number;
  segurancaDias: number;
  capacidadeFullMl: number | null;
};

export const PADRAO_ESTOQUE: ConfigEstoque = {
  prazoReposicaoDias: 15,
  segurancaDias: 7,
  capacidadeFullMl: null,
};

export function configEstoque(config: unknown): ConfigEstoque {
  const c = (config ?? {}) as Partial<ConfigEstoque>;
  return {
    prazoReposicaoDias: c.prazoReposicaoDias ?? PADRAO_ESTOQUE.prazoReposicaoDias,
    segurancaDias: c.segurancaDias ?? PADRAO_ESTOQUE.segurancaDias,
    capacidadeFullMl: c.capacidadeFullMl ?? PADRAO_ESTOQUE.capacidadeFullMl,
  };
}

export type LinhaEstoque = ResultadoEstoque & {
  itemId: string;
  titulo: string;
  sku: string | null;
  statusAnuncio: string;
  local: string;
  disponivel: number;
  vendido60d: number;
  permalink: string | null;
};

const ORDEM: Record<StatusEstoque, number> = {
  ruptura_iminente: 0,
  comprar: 1,
  ok: 2,
  excesso: 3,
  parado: 4,
  sem_dados: 5,
};

/** Quantas janelas a carga inicial cria (91 dias ÷ 13). */
const JANELAS_CARGA = 7;

export async function carregarEstoque(clienteId: string) {
  const cliente = await db().query.clientes.findFirst({ where: eq(clientes.id, clienteId) });
  if (!cliente) return null;
  const cfg = configEstoque(cliente.config);
  const hoje = diaLocal();
  const ontem = somarDias(hoje, -1);
  const inicio60 = somarDias(hoje, -60);

  // A carga inicial terminou quando as 7 janelas de pedidos foram conferidas.
  const [carga] = await db()
    .select({
      n: sql<number>`count(*)::int`,
      comDiferenca: sql<number>`count(*) filter (where not ${conferencias.ok})::int`,
    })
    .from(conferencias)
    .where(
      and(eq(conferencias.clienteId, clienteId), like(conferencias.tipo, "ml.pedidos.carga.%")),
    );
  const cargaCompleta = (carga?.n ?? 0) >= JANELAS_CARGA;

  const lista = await db().select().from(anuncios).where(eq(anuncios.clienteId, clienteId));

  const estoque = (await db().execute(sql`
    select distinct on (item_id, local) item_id, local, disponivel, dia::text as dia
    from estoque_diario where cliente_id = ${clienteId}
    order by item_id, local, dia desc
  `)) as unknown as { item_id: string; local: string; disponivel: number; dia: string }[];

  const vendas = (await db().execute(sql`
    select pi.item_id, p.dia_venda::text as dia, sum(pi.quantidade)::int as qtd
    from pedido_itens pi
    join pedidos p on p.cliente_id = pi.cliente_id and p.order_id = pi.order_id
    where pi.cliente_id = ${clienteId}
      and p.dia_venda >= ${inicio60} and p.dia_venda <= ${ontem}
      and p.status not in ('cancelled', 'invalid')
    group by 1, 2
  `)) as unknown as { item_id: string; dia: string; qtd: number }[];

  const vendasPorItem = new Map<string, Map<string, number>>();
  for (const v of vendas) {
    const m = vendasPorItem.get(v.item_id) ?? new Map<string, number>();
    m.set(v.dia, v.qtd);
    vendasPorItem.set(v.item_id, m);
  }
  const estoquePorItem = new Map(estoque.map((e) => [e.item_id, e]));

  const linhas: LinhaEstoque[] = lista
    .filter((a) => a.status !== "closed")
    .map((a) => {
      // Histórico possível: limitado pela carga inicial e pela idade do anúncio.
      let dias = cargaCompleta ? 60 : 0;
      if (a.canalCriadoEm)
        dias = Math.min(dias, Math.max(0, diasEntre(diaLocal(a.canalCriadoEm), hoje)));
      const m = vendasPorItem.get(a.itemId);
      const vendasDiarias = Array.from(
        { length: dias },
        (_, i) => m?.get(somarDias(hoje, i - dias)) ?? 0,
      );
      const e = estoquePorItem.get(a.itemId);
      const disponivel = e?.disponivel ?? 0;
      const r = analisarEstoque({
        vendasDiarias,
        disponivel,
        prazoReposicaoDias: cfg.prazoReposicaoDias,
        segurancaDias: cfg.segurancaDias,
      });
      return {
        ...r,
        itemId: a.itemId,
        titulo: a.titulo,
        sku: a.sku,
        statusAnuncio: a.status,
        local: e?.local ?? (a.logistica === "fulfillment" ? "FULL_ML" : "PROPRIO"),
        disponivel,
        vendido60d: vendasDiarias.reduce((s, v) => s + v, 0),
        permalink: a.permalink,
      };
    })
    .sort(
      (x, y) =>
        ORDEM[x.status] - ORDEM[y.status] ||
        (x.coberturaDias ?? Number.POSITIVE_INFINITY) -
          (y.coberturaDias ?? Number.POSITIVE_INFINITY),
    );

  const unidadesFull = linhas
    .filter((l) => l.local === "FULL_ML")
    .reduce((s, l) => s + l.disponivel, 0);
  const ultimaFoto = estoque.reduce((max, e) => (e.dia > max ? e.dia : max), "");

  return {
    cliente,
    cfg,
    linhas,
    cargaCompleta,
    janelasCarga: carga?.n ?? 0,
    janelasComDiferenca: carga?.comDiferenca ?? 0,
    unidadesFull,
    ultimaFoto,
  };
}
