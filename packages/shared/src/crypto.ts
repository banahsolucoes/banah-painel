import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifra tokens de cliente com AES-256-GCM. O resultado guarda versão, IV,
 * tag de autenticação e o texto cifrado: "v1.<iv>.<tag>.<dados>" em base64url.
 * Trocar a chave no futuro = nova versão, sem perder os tokens antigos.
 */
const VERSAO = "v1";

function chave(base64: string): Buffer {
  const k = Buffer.from(base64, "base64");
  if (k.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY precisa ter 32 bytes em base64");
  return k;
}

export function cifrar(texto: string, chaveBase64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chave(chaveBase64), iv);
  const dados = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSAO, iv, tag, dados]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function decifrar(cifrado: string, chaveBase64: string): string {
  const [versao, iv, tag, dados] = cifrado.split(".");
  if (versao !== VERSAO || !iv || !tag || !dados)
    throw new Error("Token cifrado em formato inválido");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    chave(chaveBase64),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dados, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
