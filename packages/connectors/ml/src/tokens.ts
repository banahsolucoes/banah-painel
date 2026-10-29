import { contasCanal, type Db } from "@banah/db";
import { cifrar, decifrar, log } from "@banah/shared";
import { eq, sql } from "drizzle-orm";
import { type MlApp, type MlTokenResposta, renovarToken } from "./oauth";

/** Renova com folga: token que vence em menos de 10 minutos já é renovado. */
const FOLGA_MS = 10 * 60 * 1000;

export function camposDoToken(t: MlTokenResposta, chave: string) {
  return {
    accessTokenCifrado: cifrar(t.access_token, chave),
    refreshTokenCifrado: cifrar(t.refresh_token, chave),
    expiraEm: new Date(Date.now() + t.expires_in * 1000),
    escopos: t.scope,
  };
}

/**
 * Devolve um access token válido para a conta, renovando se preciso.
 * A renovação acontece dentro de uma transação com a linha travada (FOR UPDATE):
 * duas execuções ao mesmo tempo nunca gastam o mesmo refresh token (que é de uso único).
 */
export async function obterAccessToken(
  db: Db,
  contaId: string,
  app: MlApp,
  chave: string,
): Promise<string> {
  const r = await db.transaction(async (tx): Promise<{ token: string } | { erro: unknown }> => {
    const linhas = await tx.execute(
      sql`select * from contas_canal where id = ${contaId} for update`,
    );
    const conta = linhas[0] as
      | {
          access_token_cifrado: string;
          refresh_token_cifrado: string;
          expira_em: Date | string;
          status: string;
        }
      | undefined;
    if (!conta) throw new Error(`Conta ${contaId} não encontrada`);
    if (conta.status === "revogada")
      throw new Error(`Conta ${contaId} foi desconectada pelo cliente`);

    const expira = new Date(conta.expira_em).getTime();
    if (expira - Date.now() > FOLGA_MS)
      return { token: decifrar(conta.access_token_cifrado, chave) };

    try {
      const novo = await renovarToken(app, decifrar(conta.refresh_token_cifrado, chave));
      await tx
        .update(contasCanal)
        .set({
          ...camposDoToken(novo, chave),
          status: "ativa",
          ultimoErro: null,
          atualizadoEm: new Date(),
        })
        .where(eq(contasCanal.id, contaId));
      log.info("token ML renovado", { contaId });
      return { token: novo.access_token };
    } catch (erro) {
      return { erro };
    }
  });

  if ("token" in r) return r.token;

  // Gravado depois da transação (já sem trava) para o erro aparecer no painel.
  const msg = r.erro instanceof Error ? r.erro.message : String(r.erro);
  await db
    .update(contasCanal)
    .set({ status: "erro", ultimoErro: msg, atualizadoEm: new Date() })
    .where(eq(contasCanal.id, contaId));
  throw r.erro;
}
