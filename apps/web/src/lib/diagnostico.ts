/**
 * Confere o FORMATO das variáveis de ambiente, nunca o valor.
 * Responde só "ok" ou o problema, para achar erro de configuração sem expor segredo.
 */
type Regra = { nome: string; checar: (v: string) => string | null };

const semEspacos = (v: string) =>
  v !== v.trim()
    ? "tem espaço no começo ou no fim"
    : /^["'].*["']$/.test(v)
      ? "está entre aspas"
      : null;

const REGRAS: Regra[] = [
  {
    nome: "APP_ENV",
    checar: (v) => (["local", "staging", "production"].includes(v) ? null : "valor inválido"),
  },
  {
    nome: "APP_URL",
    checar: (v) =>
      v.startsWith("https://") || v.startsWith("http://localhost")
        ? null
        : "deve começar com https://",
  },
  {
    nome: "DATABASE_URL",
    checar: (v) =>
      !v.startsWith("postgres")
        ? "deve começar com postgresql://"
        : v.includes("[") || v.includes("YOUR-PASSWORD")
          ? "ainda tem [YOUR-PASSWORD] ou colchetes"
          : null,
  },
  {
    nome: "NEXT_PUBLIC_SUPABASE_URL",
    checar: (v) =>
      !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(v)
        ? "deve ser só https://xxxx.supabase.co"
        : null,
  },
  {
    nome: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    checar: (v) =>
      v.startsWith("sb_secret_")
        ? "é a chave SECRETA; use a publishable/anon"
        : v.startsWith("sb_publishable_") || v.startsWith("eyJ")
          ? null
          : "não parece publishable (sb_publishable_) nem anon (eyJ)",
  },
  { nome: "ML_CLIENT_ID", checar: (v) => (/^\d+$/.test(v) ? null : "deve ter só números") },
  { nome: "ML_CLIENT_SECRET", checar: (v) => (v.length >= 16 ? null : "curto demais") },
  {
    nome: "ML_REDIRECT_URI",
    checar: (v) =>
      v.endsWith("/api/auth/ml/callback") ? null : "deve terminar em /api/auth/ml/callback",
  },
  {
    nome: "TOKEN_ENCRYPTION_KEY",
    checar: (v) => (Buffer.from(v, "base64").length === 32 ? null : "não tem 32 bytes em base64"),
  },
  { nome: "CRON_SECRET", checar: (v) => (v.length >= 16 ? null : "curto demais") },
  { nome: "ADMIN_EMAILS", checar: (v) => (v.includes("@") ? null : "sem e-mail") },
];

export function conferirConfiguracao(): Record<string, string> {
  const r: Record<string, string> = {};
  for (const { nome, checar } of REGRAS) {
    const v = process.env[nome];
    r[nome] = !v ? "AUSENTE" : (semEspacos(v) ?? checar(v) ?? "ok");
  }
  return r;
}
