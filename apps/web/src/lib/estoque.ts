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
  /** Todos os anúncios ativos do mesmo SKU. */
  itens: { itemId: string; permalink: string | null }[];
  titulo: string;
  sku: string | null;
  statusAnuncio: string;
  local: string;
  disponivel: number;
  unidadesFullMl: number;
  vendido60d: number;
  /** Dias desde o cadastro do anúncio no canal. */
  diasAtivo: number | null;
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

  // Última foto de cada anúncio, somando os locais (Full + próprio) do mesmo dia.
  const estoque = (await db().execute(sql`
    with ult as (
      select item_id, max(dia) as dia from estoque_diario
      where cliente_id = ${clienteId} group by item_id
    )
    select e.item_id, sum(e.disponivel)::int as disponivel, e.dia::text as dia,
      array_agg(e.local order by e.local) as locais,
      coalesce(sum(e.disponivel) filter (where e.local = 'FULL_ML'), 0)::int as full_ml
    from estoque_diario e join ult on ult.item_id = e.item_id and ult.dia = e.dia
    where e.cliente_id = ${clienteId}
    group by e.item_id, e.dia
  `)) as unknown as {
    item_id: string;
    disponivel: number;
    dia: string;
    locais: string[];
    full_ml: number;
  }[];

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

  // Um SKU pode ter vários anúncios (clássico, premium, catálogo): tudo vira uma linha só.
  // Anúncio sem SKU fica sozinho, pelo próprio código.
  const grupos = new Map<string, (typeof lista)[number][]>();
  for (const a of lista) {
    // Só anúncios ativos: pausado ou fechado não entra na análise de reposição.
    if (a.status !== "active") continue;
    const chave = a.sku?.trim() || a.itemId;
    grupos.set(chave, [...(grupos.get(chave) ?? []), a]);
  }

  const linhas: LinhaEstoque[] = [...grupos.values()]
    .map((grupo) => {
      // Histórico possível: limitado pela carga inicial e pelo anúncio mais antigo do SKU.
      const criados = grupo
        .map((a) => a.canalCriadoEm)
        .filter((d): d is Date => d !== null)
        .map((d) => diasEntre(diaLocal(d), hoje));
      const diasAtivo = criados.length ? Math.max(...criados) : null;
      const dias = cargaCompleta ? Math.min(60, Math.max(0, diasAtivo ?? 60)) : 0;

      // Venda do SKU = soma das vendas de todos os anúncios dele, dia a dia.
      const vendasDiarias = Array.from({ length: dias }, (_, i) => {
        const dia = somarDias(hoje, i - dias);
        return grupo.reduce((t, a) => t + (vendasPorItem.get(a.itemId)?.get(dia) ?? 0), 0);
      });

      // Estoque do SKU: os anúncios do mesmo SKU dividem o mesmo estoque físico (o ML/ERP
      // repete o número em cada um), então por local vale o maior, não a soma.
      const porLocal = new Map<string, number>();
      for (const a of grupo) {
        const e = estoquePorItem.get(a.itemId);
        if (!e) continue;
        for (const local of e.locais) {
          const qtd = local === "FULL_ML" ? e.full_ml : e.disponivel - e.full_ml;
          porLocal.set(local, Math.max(porLocal.get(local) ?? 0, qtd));
        }
      }
      const disponivel = [...porLocal.values()].reduce((t, v) => t + v, 0);
      const principal = [...grupo].sort(
        (x, y) =>
          (vendasPorItem.get(y.itemId)?.size ?? 0) - (vendasPorItem.get(x.itemId)?.size ?? 0),
      )[0] as (typeof grupo)[number];

      const r = analisarEstoque({
        vendasDiarias,
        disponivel,
        prazoReposicaoDias: cfg.prazoReposicaoDias,
        segurancaDias: cfg.segurancaDias,
      });
      return {
        ...r,
        itemId: principal.itemId,
        itens: grupo.map((a) => ({ itemId: a.itemId, permalink: a.permalink })),
        titulo: principal.titulo,
        sku: principal.sku,
        statusAnuncio: principal.status,
        local: porLocal.size
          ? [...porLocal.keys()].sort().join("+")
          : principal.logistica === "fulfillment"
            ? "FULL_ML"
            : "PROPRIO",
        unidadesFullMl: porLocal.get("FULL_ML") ?? 0,
        disponivel,
        vendido60d: vendasDiarias.reduce((s, v) => s + v, 0),
        diasAtivo,
        permalink: principal.permalink,
      };
    })
    .sort(
      (x, y) =>
        ORDEM[x.status] - ORDEM[y.status] ||
        (x.coberturaDias ?? Number.POSITIVE_INFINITY) -
          (y.coberturaDias ?? Number.POSITIVE_INFINITY),
    );

  const unidadesFull = linhas.reduce((s, l) => s + l.unidadesFullMl, 0);
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
