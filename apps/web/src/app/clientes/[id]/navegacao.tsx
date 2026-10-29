/** Abas de um cliente: Vendas · Estoque · Preços · Custos. */
export function Navegacao({
  clienteId,
  nome,
  atual,
}: {
  clienteId: string;
  nome: string;
  atual: "vendas" | "estoque" | "precos" | "promocoes" | "custos";
}) {
  const abas = [
    { id: "vendas", rotulo: "Vendas", href: `/clientes/${clienteId}/vendas` },
    { id: "estoque", rotulo: "Estoque e previsão", href: `/clientes/${clienteId}/estoque` },
    { id: "precos", rotulo: "Preços", href: `/clientes/${clienteId}/precos` },
    { id: "promocoes", rotulo: "Promoções", href: `/clientes/${clienteId}/promocoes` },
    { id: "custos", rotulo: "Custos", href: `/clientes/${clienteId}/custos` },
  ] as const;
  return (
    <nav className="navegacao">
      <a href="/">← Clientes</a>
      <strong>{nome}</strong>
      <div className="abas">
        {abas.map((a) => (
          <a key={a.id} href={a.href} className={a.id === atual ? "aba ativa" : "aba"}>
            {a.rotulo}
          </a>
        ))}
      </div>
    </nav>
  );
}
