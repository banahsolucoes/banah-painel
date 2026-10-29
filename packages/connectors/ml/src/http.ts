import { log } from "@banah/shared";
import { ML_API } from "./oauth";

export class MlErro extends Error {
  constructor(
    public status: number,
    public caminho: string,
    corpo: string,
  ) {
    super(`ML ${status} em ${caminho}: ${corpo.slice(0, 300)}`);
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Única porta de saída para a API do ML. Repete em 429 (limite) e 5xx com espera crescente.
 * 4xx que não seja 429 não repete: é erro de pedido e precisa aparecer.
 */
export async function mlGet<T>(
  accessToken: string,
  caminho: string,
  params: Record<string, string | number> = {},
  headers: Record<string, string> = {},
): Promise<T> {
  const url = new URL(caminho, ML_API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  for (let tentativa = 1; ; tentativa++) {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", ...headers },
    });
    if (res.ok) return (await res.json()) as T;

    const corpo = await res.text();
    const repetivel = res.status === 429 || res.status >= 500;
    if (!repetivel || tentativa >= 4) throw new MlErro(res.status, caminho, corpo);

    const espera = 1000 * 2 ** tentativa;
    log.warn("ML repetindo chamada", { caminho, status: res.status, esperaMs: espera });
    await esperar(espera);
  }
}

type Pagina<T> = { results: T[]; paging: { total: number; offset: number; limit: number } };

/**
 * Busca todas as páginas e CONFERE contra o total informado pela API.
 * Se o número final não bater, lança erro em vez de devolver dado incompleto calado.
 */
export async function mlPaginar<T>(
  accessToken: string,
  caminho: string,
  params: Record<string, string | number> = {},
  limite = 50,
): Promise<{ itens: T[]; total: number }> {
  const itens: T[] = [];
  let total = 0;
  for (let offset = 0; ; offset += limite) {
    const p = await mlGet<Pagina<T>>(accessToken, caminho, { ...params, offset, limit: limite });
    total = p.paging.total;
    itens.push(...p.results);
    if (p.results.length === 0 || itens.length >= total) break;
  }
  if (itens.length !== total) {
    throw new Error(`Paginação incompleta em ${caminho}: ${itens.length} de ${total}`);
  }
  return { itens, total };
}
