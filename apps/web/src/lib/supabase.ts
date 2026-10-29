import { exigir } from "@banah/shared";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Cliente Supabase do lado do servidor, usado só para login/sessão. Dados vêm do Drizzle. */
export async function supabaseServidor() {
  const loja = await cookies();
  return createServerClient(
    exigir("NEXT_PUBLIC_SUPABASE_URL"),
    exigir("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll: () => loja.getAll(),
        setAll: (lista) => {
          try {
            for (const { name, value, options } of lista) loja.set(name, value, options);
          } catch {
            // Chamado de um Server Component: a sessão é renovada pelo proxy.
          }
        },
      },
    },
  );
}
