import { exigir } from "@banah/shared";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

let _db: ReturnType<typeof criar> | undefined;

function criar() {
  // prepare:false = compatível com o pooler do Supabase (modo transação) em serverless.
  const cliente = postgres(exigir("DATABASE_URL"), { prepare: false, max: 5 });
  return drizzle(cliente, { schema });
}

/** Conexão única por processo. O servidor acessa o banco com papel próprio (sem RLS). */
export function db() {
  _db ??= criar();
  return _db;
}

export type Db = ReturnType<typeof db>;
