// Aplica as migrações da pasta drizzle/ no banco de DATABASE_URL.
// Substitui o "drizzle-kit migrate", que esconde a mensagem de erro real.
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida");
  process.exit(1);
}

const pasta = fileURLToPath(new URL("./drizzle", import.meta.url));
const cliente = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

try {
  await migrate(drizzle(cliente), { migrationsFolder: pasta });
  console.log("Migrações aplicadas.");
} catch (erro) {
  const causa = erro?.cause ?? erro;
  console.error("ERRO NA MIGRAÇÃO:", causa?.code ?? "", causa?.message ?? String(causa));
  process.exitCode = 1;
} finally {
  await cliente.end();
}
