import { createHash, randomBytes } from "node:crypto";

export const ML_AUTH_URL = "https://auth.mercadolivre.com.br/authorization";
export const ML_API = "https://api.mercadolibre.com";

export type MlApp = { clientId: string; clientSecret: string; redirectUri: string };

export type MlTokenResposta = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number;
  refresh_token: string;
};

/** PKCE: o verificador fica num cookie do navegador; o desafio vai para o ML. */
export function gerarPkce() {
  const verificador = randomBytes(32).toString("base64url");
  const desafio = createHash("sha256").update(verificador).digest("base64url");
  return { verificador, desafio };
}

export function urlDeAutorizacao(app: MlApp, estado: string, desafioPkce: string): string {
  const u = new URL(ML_AUTH_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", app.clientId);
  u.searchParams.set("redirect_uri", app.redirectUri);
  u.searchParams.set("state", estado);
  u.searchParams.set("code_challenge", desafioPkce);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

async function pedirToken(corpo: Record<string, string>): Promise<MlTokenResposta> {
  const res = await fetch(`${ML_API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(corpo),
  });
  const json = (await res.json()) as MlTokenResposta & { message?: string; error?: string };
  if (!res.ok) {
    throw new Error(
      `ML /oauth/token ${res.status}: ${json.error ?? ""} ${json.message ?? ""}`.trim(),
    );
  }
  return json;
}

export function trocarCodigo(app: MlApp, codigo: string, verificadorPkce: string) {
  return pedirToken({
    grant_type: "authorization_code",
    client_id: app.clientId,
    client_secret: app.clientSecret,
    code: codigo,
    redirect_uri: app.redirectUri,
    code_verifier: verificadorPkce,
  });
}

/** O refresh token do ML é de uso único: a resposta traz um novo, que precisa ser gravado. */
export function renovarToken(app: MlApp, refreshToken: string) {
  return pedirToken({
    grant_type: "refresh_token",
    client_id: app.clientId,
    client_secret: app.clientSecret,
    refresh_token: refreshToken,
  });
}
