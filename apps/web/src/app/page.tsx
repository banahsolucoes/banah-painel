import { clientes, contasCanal, db } from "@banah/db";
import { appEnv } from "@banah/shared";
import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/sessao";
import { criarCliente, excluirCliente, sair } from "./actions";
import { BotaoEnviar } from "./botao-enviar";

export const dynamic = "force-dynamic";

const ROTULO_STATUS = {
  ativa: "conectada",
  erro: "token com erro",
  revogada: "desconectada",
} as const;
const CLASSE_STATUS = { ativa: "ok", erro: "erro", revogada: "alerta" } as const;

export default async function Inicio({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/login");
  const { msg } = await searchParams;

  if (sessao.papel !== "admin") {
    return (
      <main>
        <h1>Painel BANAH</h1>
        <p className="suave">Seu acesso está sendo preparado pela equipe BANAH.</p>
      </main>
    );
  }

  const lista = await db()
    .select()
    .from(clientes)
    .orderBy(asc(clientes.nome), asc(clientes.criadoEm));
  const contas = await db().select().from(contasCanal);

  return (
    <main>
      <div className="linha">
        <div>
          <h1>Painel BANAH</h1>
          <p className="suave">
            {sessao.email} · ambiente {appEnv()}
          </p>
        </div>
        <form action={sair}>
          <BotaoEnviar secundario enviando="Saindo…">
            Sair
          </BotaoEnviar>
        </form>
      </div>

      {msg && <div className="aviso">{msg}</div>}

      <h2>Novo cliente</h2>
      <form action={criarCliente} className="linha" style={{ justifyContent: "flex-start" }}>
        <input name="nome" placeholder="Nome da empresa" required minLength={2} />
        <BotaoEnviar>Cadastrar</BotaoEnviar>
      </form>

      <h2>Clientes ({lista.length})</h2>
      {lista.length === 0 && <p className="suave">Nenhum cliente cadastrado ainda.</p>}
      {lista.map((c) => {
        const doCliente = contas.filter((k) => k.clienteId === c.id);
        return (
          <div className="cartao" key={c.id}>
            <div className="linha">
              <strong>{c.nome}</strong>
              <div className="linha">
                {doCliente.length === 0 && (
                  <form action={excluirCliente}>
                    <input type="hidden" name="id" value={c.id} />
                    <BotaoEnviar
                      secundario
                      enviando="Excluindo…"
                      confirmar={`Excluir o cliente ${c.nome}?`}
                    >
                      Excluir
                    </BotaoEnviar>
                  </form>
                )}
                <a className="botao" href={`/api/auth/ml/start?cliente=${c.id}`}>
                  Conectar Mercado Livre
                </a>
              </div>
            </div>
            {doCliente.map((k) => (
              <p key={k.id} className="linha">
                <span>
                  {k.canal === "MELI" ? "Mercado Livre" : k.canal} · {k.apelido ?? k.sellerId}
                </span>
                <span className={`selo ${CLASSE_STATUS[k.status]}`}>{ROTULO_STATUS[k.status]}</span>
              </p>
            ))}
            {doCliente.some((k) => k.ultimoErro) && (
              <p className="suave">
                Último erro: {doCliente.find((k) => k.ultimoErro)?.ultimoErro}
              </p>
            )}
          </div>
        );
      })}
    </main>
  );
}
