import { clientes, db, jobs } from "@banah/db";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enfileirar, executarLote, reservar } from "./index";

/**
 * Teste contra um Postgres de verdade. Roda no CI (que sobe um banco descartável)
 * e na sua máquina quando DATABASE_URL aponta para o Supabase local.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)("fila no Postgres", () => {
  let clienteId = "";

  beforeAll(async () => {
    const [c] = await db().insert(clientes).values({ nome: "Teste fila" }).returning();
    clienteId = c?.id ?? "";
  });

  afterAll(async () => {
    await db().delete(clientes).where(eq(clientes.id, clienteId));
  });

  it("não duplica tarefa com a mesma chave", async () => {
    const t = { clienteId, tipo: "teste.ok", chaveUnica: `dup:${clienteId}` };
    await enfileirar(db(), t);
    await enfileirar(db(), t);
    const linhas = await db().select().from(jobs).where(eq(jobs.chaveUnica, t.chaveUnica));
    expect(linhas).toHaveLength(1);
  });

  it("duas reservas simultâneas nunca pegam a mesma tarefa", async () => {
    for (let i = 0; i < 6; i++) {
      await enfileirar(db(), { clienteId, tipo: "teste.ok", chaveUnica: `par:${clienteId}:${i}` });
    }
    const [a, b] = await Promise.all([reservar(db(), 4), reservar(db(), 4)]);
    const ids = [...a, ...b].map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("conclui o que deu certo e reagenda o que falhou", async () => {
    await db().execute(sql`update jobs set status = 'pendente', executar_em = now()
      where cliente_id = ${clienteId}`);
    await enfileirar(db(), { clienteId, tipo: "teste.falha", chaveUnica: `falha:${clienteId}` });
    const r = await executarLote(
      db(),
      {
        "teste.ok": async () => {},
        "teste.falha": async () => {
          throw new Error("falha proposital");
        },
      },
      { limite: 50 },
    );
    expect(r.erro).toBe(1);
    const [falhou] = await db()
      .select()
      .from(jobs)
      .where(eq(jobs.chaveUnica, `falha:${clienteId}`));
    expect(falhou?.status).toBe("pendente");
    expect(falhou?.tentativas).toBe(1);
    expect(falhou?.ultimoErro).toBe("falha proposital");
    expect(falhou && falhou.executarEm.getTime()).toBeGreaterThan(Date.now());
  });
});
