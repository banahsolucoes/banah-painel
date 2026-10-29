-- Isolamento por cliente nas tabelas da Fase 1 (mesma regra da 0001).
ALTER TABLE "anuncios" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pedidos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pedido_itens" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "estoque_diario" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "ver_anuncios" ON "anuncios" FOR SELECT USING (public.pode_ver_cliente(cliente_id));
--> statement-breakpoint
CREATE POLICY "ver_pedidos" ON "pedidos" FOR SELECT USING (public.pode_ver_cliente(cliente_id));
--> statement-breakpoint
CREATE POLICY "ver_pedido_itens" ON "pedido_itens" FOR SELECT USING (public.pode_ver_cliente(cliente_id));
--> statement-breakpoint
CREATE POLICY "ver_estoque_diario" ON "estoque_diario" FOR SELECT USING (public.pode_ver_cliente(cliente_id));
