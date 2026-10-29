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

/**
 * Escrita na API do ML (PUT/POST). Repete só em 429 e 5xx; qualquer outro erro sobe
 * com a mensagem do ML, para aparecer na tela como veio.
 */
export async function mlEnviar<T>(
  accessToken: string,
  metodo: "PUT" | "POST" | "DELETE",
  caminho: string,
  corpo?: unknown,
  params: Record<string, string | number> = {},
): Promise<T> {
  const url = new URL(caminho, ML_API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  for (let tentativa = 1; ; tentativa++) {
    const res = await fetch(url, {
      method: metodo,
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const texto = await res.text();
    if (res.ok) return (texto ? JSON.parse(texto) : {}) as T;
    const repetivel = res.status === 429 || res.status >= 500;
    if (!repetivel || tentativa >= 3) throw new MlErro(res.status, caminho, texto);
    await esperar(1000 * 2 ** tentativa);
  }
}

/** Mensagem legível de um erro do ML (o corpo costuma ter message e cause[]). */
export function mensagemDoErro(e: unknown): string {
  if (!(e instanceof MlErro)) return e instanceof Error ? e.message : String(e);
  const bruto = e.message.replace(/^ML \d+ em [^:]+: /, "");
  try {
    const j = JSON.parse(bruto) as { message?: string; cause?: { message?: string }[] };
    const causas = (j.cause ?? []).map((c) => c.message).filter(Boolean);
    return [j.message, ...causas].filter(Boolean).join(" · ") || bruto;
  } catch {
    return bruto;
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
