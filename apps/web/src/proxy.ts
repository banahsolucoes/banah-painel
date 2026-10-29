import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/** Rotas que não exigem login (máquinas chamam ou é a própria tela de login). */
const PUBLICAS = ["/login", "/auth/callback", "/api/health", "/api/cron", "/api/webhooks"];

export async function proxy(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (lista) => {
          for (const { name, value } of lista) request.cookies.set(name, value);
          resposta = NextResponse.next({ request });
          for (const { name, value, options } of lista) resposta.cookies.set(name, value, options);
        },
      },
    },
  );

  // Renova a sessão se preciso. Não remover: sem isso o login cai no meio do uso.
  const { data } = await supabase.auth.getUser();

  const caminho = request.nextUrl.pathname;
  if (!data.user && !PUBLICAS.some((p) => caminho.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return resposta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
