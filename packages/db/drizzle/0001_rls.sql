-- Isolamento por cliente (Row Level Security).
-- O servidor do Painel acessa o banco com o papel do dono do banco, que ignora RLS.
-- Estas regras protegem qualquer acesso feito com a chave pública do Supabase
-- (papéis anon/authenticated): sem regra, ninguém lê nada.

CREATE OR REPLACE FUNCTION public.pode_ver_cliente(cid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = nullif(coalesce(current_setting('request.jwt.claim.sub', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
      AND (u.papel IN ('admin', 'equipe') OR u.cliente_id = cid)
  );
$$;
--> statement-breakpoint
ALTER TABLE "clientes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "usuarios" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contas_canal" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "coletas" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "conferencias" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "acoes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "usuario_ve_a_si" ON "usuarios" FOR SELECT
  USING (id = nullif(coalesce(current_setting('request.jwt.claim.sub', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid);
--> statement-breakpoint
CREATE POLICY "ver_cliente" ON "clientes" FOR SELECT USING (public.pode_ver_cliente(id));
--> statement-breakpoint
CREATE POLICY "ver_coletas" ON "coletas" FOR SELECT USING (public.pode_ver_cliente(cliente_id));
--> statement-breakpoint
CREATE POLICY "ver_conferencias" ON "conferencias" FOR SELECT USING (public.pode_ver_cliente(cliente_id));
--> statement-breakpoint
CREATE POLICY "ver_acoes" ON "acoes" FOR SELECT USING (public.pode_ver_cliente(cliente_id));
-- contas_canal e jobs: sem regra de leitura. Tokens e fila nunca saem pela chave pública.
