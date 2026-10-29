-- Isolamento por cliente nas tabelas da Fase 2 (mesma regra da 0001).
ALTER TABLE "produtos_custo" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ads_diario" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "reputacao_diaria" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "ver_produtos_custo" ON "produtos_custo" FOR SELECT USING (public.pode_ver_cliente(cliente_id));
--> statement-breakpoint
CREATE POLICY "ver_ads_diario" ON "ads_diario" FOR SELECT USING (public.pode_ver_cliente(cliente_id));
--> statement-breakpoint
CREATE POLICY "ver_reputacao_diaria" ON "reputacao_diaria" FOR SELECT USING (public.pode_ver_cliente(cliente_id));
