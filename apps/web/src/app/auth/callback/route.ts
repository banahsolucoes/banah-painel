import { supabaseServidor } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Retorno do link mágico de login enviado por e-mail. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const codigo = url.searchParams.get("code");
  if (codigo) {
    const supabase = await supabaseServidor();
    await supabase.auth.exchangeCodeForSession(codigo);
  }
  return Response.redirect(new URL("/", request.url), 302);
}
