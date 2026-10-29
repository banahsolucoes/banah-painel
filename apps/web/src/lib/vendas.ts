import { calcularIndicadores } from "@banah/core";
import { clientes, contasCanal, db } from "@banah/db";
import { diaLocal, diasEntre, somarDias } from "@banah/shared";
import { eq, sql } from "drizzle-orm";

export const PERIODOS = {
  hoje: "Hoje",
  ontem: "Ontem",
  "7d": "7 dias",
  "30d": "30 dias",
  mes: "Mês atual",
} as const;
export type Periodo = keyof typeof PERIODOS;

export function intervalo(p: Periodo, hoje = diaLocal()): { de: string; ate: string } {
  switch (p) {
    case "hoje":
      return { de: hoje, ate: hoje };
    case "ontem":
      return { de: somarDias(hoje, -1), ate: somarDias(hoje, -1) };
    case "7d":
      return { de: somarDias(hoje, -6), ate: hoje };
    case "30d":
      return { de: somarDias(hoje, -29), ate: hoje };
    case "mes":
      return { de: `${hoje.slice(0, 8)}01`, ate: hoje };
  }
}

/** Período anterior de mesmo tamanho, para comparar. */
export function intervaloAnterior(i: { de: string; ate: string }) {
  const dias = diasEntre(i.de, i.ate) + 1;
  return { de: somarDias(i.de, -dias), ate: somarDias(i.de, -1) };
}

export function impostoDoCliente(config: unknown): number | null {
  const v = (config as { aliquotaImpostoPct?: number } | null)?.aliquotaImpostoPct;
  return typeof v === "number" ? v : null;
}

const STATUS_FORA = sql`('cancelled', 'invalid')`;

async function base(clienteId: string, de: string, ate: string, impostoPct: number | null) {
  const [p] = (await db().execute(sql`
    select
      count(*)::int as pedidos,
      coalesce(sum(total_centavos), 0)::bigint as faturamento,
      coalesce(sum(tarifas_centavos), 0)::bigint as tarifas,
      count(*) filter (where tarifas_centavos is null)::int as sem_tarifa,
      count(*) filter (where frete_vendedor_centavos is null and shipping_id is not null)::int as sem_frete
    from pedidos
    where cliente_id = ${clienteId} and dia_venda between ${de} and ${ate}
      and status not in ${STATUS_FORA}
  `)) as unknown as {
    pedidos: number;
    faturamento: string;
    tarifas: string;
    sem_tarifa: number;
    sem_frete: number;
  }[];

  // Pedidos do mesmo carrinho dividem o mesmo envio: o frete conta uma vez por envio.
  const [f] = (await db().execute(sql`
    select coalesce(sum(frete), 0)::bigint as frete from (
      select max(frete_vendedor_centavos) as frete from pedidos
      where cliente_id = ${clienteId} and dia_venda between ${de} and ${ate}
        and status not in ${STATUS_FORA} and shipping_id is not null
      group by shipping_id
    ) t
  `)) as unknown as { frete: string }[];

  const [c] = (await db().execute(sql`
    select
      coalesce(sum(pi.quantidade), 0)::int as unidades,
      coalesce(sum(pi.quantidade * pc.custo_centavos), 0)::bigint as custo,
      coalesce(sum(pi.quantidade * pi.preco_unit_centavos) filter (where pc.custo_centavos is null), 0)::bigint as fat_sem_custo
    from pedido_itens pi
    join pedidos p on p.cliente_id = pi.cliente_id and p.order_id = pi.order_id
    left join anuncios a on a.cliente_id = pi.cliente_id and a.item_id = pi.item_id
    left join produtos_custo pc on pc.cliente_id = pi.cliente_id and pc.sku = coalesce(pi.sku, a.sku)
    where pi.cliente_id = ${clienteId} and p.dia_venda between ${de} and ${ate}
      and p.status not in ${STATUS_FORA}
  `)) as unknown as { unidades: number; custo: string; fat_sem_custo: string }[];

  const [a] = (await db().execute(sql`
    select
      coalesce(sum(custo_centavos), 0)::bigint as custo,
      coalesce(sum(receita_centavos), 0)::bigint as receita,
      coalesce(sum(cliques), 0)::bigint as cliques,
      coalesce(sum(impressoes), 0)::bigint as impressoes,
      count(distinct dia)::int as dias
    from ads_diario
    where cliente_id = ${clienteId} and dia between ${de} and ${ate}
  `)) as unknown as {
    custo: string;
    receita: string;
    cliques: string;
    impressoes: string;
    dias: number;
  }[];

  const indicadores = calcularIndicadores({
    faturamentoCentavos: Number(p?.faturamento ?? 0),
    pedidos: p?.pedidos ?? 0,
    unidades: c?.unidades ?? 0,
    tarifasCentavos: Number(p?.tarifas ?? 0),
    freteCentavos: Number(f?.frete ?? 0),
    custoCentavos: Number(c?.custo ?? 0),
    impostoPct,
    adsCustoCentavos: Number(a?.custo ?? 0),
    adsReceitaCentavos: Number(a?.receita ?? 0),
    adsCliques: Number(a?.cliques ?? 0),
    adsImpressoes: Number(a?.impressoes ?? 0),
  });

  return {
    indicadores,
    tarifasCentavos: Number(p?.tarifas ?? 0),
    freteCentavos: Number(f?.frete ?? 0),
    custoCentavos: Number(c?.custo ?? 0),
    lacunas: {
      pedidosSemTarifa: p?.sem_tarifa ?? 0,
      pedidosSemFrete: p?.sem_frete ?? 0,
      faturamentoSemCustoCentavos: Number(c?.fat_sem_custo ?? 0),
      diasComAds: a?.dias ?? 0,
    },
  };
}

export async function carregarVendas(clienteId: string, periodo: Periodo) {
  const cliente = await db().query.clientes.findFirst({ where: eq(clientes.id, clienteId) });
  if (!cliente) return null;
  const impostoPct = impostoDoCliente(cliente.config);
  const i = intervalo(periodo);
  const ant = intervaloAnterior(i);

  const [atual, anterior] = await Promise.all([
    base(clienteId, i.de, i.ate, impostoPct),
    base(clienteId, ant.de, ant.ate, impostoPct),
  ]);

  const hoje = diaLocal();
  const serie = (await db().execute(sql`
    with dias as (
      select generate_series(${somarDias(hoje, -29)}::date, ${hoje}::date, '1 day')::date as dia
    ),
    v as (
      select dia_venda as dia, count(*)::int as pedidos, sum(total_centavos)::bigint as fat
      from pedidos where cliente_id = ${clienteId} and status not in ${STATUS_FORA}
        and dia_venda >= ${somarDias(hoje, -29)} group by 1
    ),
    ad as (
      select dia, sum(custo_centavos)::bigint as ads from ads_diario
      where cliente_id = ${clienteId} and dia >= ${somarDias(hoje, -29)} group by 1
    )
    select d.dia::text as dia, coalesce(v.pedidos, 0) as pedidos,
      coalesce(v.fat, 0)::bigint as fat, coalesce(ad.ads, 0)::bigint as ads
    from dias d left join v on v.dia = d.dia left join ad on ad.dia = d.dia
    order by d.dia desc
  `)) as unknown as { dia: string; pedidos: number; fat: string; ads: string }[];

  const top = (await db().execute(sql`
    with vend as (
      select pi.item_id, sum(pi.quantidade)::int as unidades,
        sum(pi.quantidade * pi.preco_unit_centavos)::bigint as fat
      from pedido_itens pi
      join pedidos p on p.cliente_id = pi.cliente_id and p.order_id = pi.order_id
      where pi.cliente_id = ${clienteId} and p.dia_venda between ${i.de} and ${i.ate}
        and p.status not in ${STATUS_FORA}
      group by 1
    ),
    ad as (
      select item_id, sum(custo_centavos)::bigint as ads, sum(receita_centavos)::bigint as receita_ads
      from ads_diario where cliente_id = ${clienteId} and dia between ${i.de} and ${i.ate} group by 1
    )
    select coalesce(vend.item_id, ad.item_id) as item_id, a.titulo, a.sku,
      coalesce(vend.unidades, 0) as unidades, coalesce(vend.fat, 0)::bigint as fat,
      coalesce(ad.ads, 0)::bigint as ads, coalesce(ad.receita_ads, 0)::bigint as receita_ads
    from vend full join ad on ad.item_id = vend.item_id
    left join anuncios a on a.cliente_id = ${clienteId} and a.item_id = coalesce(vend.item_id, ad.item_id)
    order by fat desc, ads desc
    limit 15
  `)) as unknown as {
    item_id: string;
    titulo: string | null;
    sku: string | null;
    unidades: number;
    fat: string;
    ads: string;
    receita_ads: string;
  }[];

  const [rep] = (await db().execute(sql`
    select r.*, r.dia::text as dia_texto from reputacao_diaria r
    where r.cliente_id = ${clienteId} order by r.dia desc limit 1
  `)) as unknown as {
    nivel: string | null;
    medalha: string | null;
    reclamacoes_taxa: number | null;
    atrasos_taxa: number | null;
    cancelamentos_taxa: number | null;
    vendas_periodo: number | null;
    dia_texto: string;
  }[];

  const contas = await db().select().from(contasCanal).where(eq(contasCanal.clienteId, clienteId));
  const adsStatus = contas.find((c) => c.canal === "MELI")?.adsStatus ?? null;

  return {
    cliente,
    impostoPct,
    intervalo: i,
    atual,
    anterior,
    serie,
    top,
    reputacao: rep ?? null,
    adsStatus,
  };
}
