CREATE TABLE "anuncios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"titulo" text NOT NULL,
	"sku" text,
	"preco_centavos" integer NOT NULL,
	"status" text NOT NULL,
	"logistica" text,
	"catalogo" boolean DEFAULT false NOT NULL,
	"catalog_product_id" text,
	"permalink" text,
	"thumbnail" text,
	"canal_criado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estoque_diario" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "estoque_diario_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"cliente_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"local" text NOT NULL,
	"dia" date NOT NULL,
	"disponivel" integer NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedido_itens" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pedido_itens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"cliente_id" uuid NOT NULL,
	"order_id" text NOT NULL,
	"item_id" text NOT NULL,
	"variacao_id" text DEFAULT '' NOT NULL,
	"sku" text,
	"titulo" text,
	"quantidade" integer NOT NULL,
	"preco_unit_centavos" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"order_id" text NOT NULL,
	"pack_id" text,
	"status" text NOT NULL,
	"total_centavos" integer NOT NULL,
	"canal_criado_em" timestamp with time zone NOT NULL,
	"canal_atualizado_em" timestamp with time zone,
	"dia_venda" date NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anuncios" ADD CONSTRAINT "anuncios_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anuncios" ADD CONSTRAINT "anuncios_conta_id_contas_canal_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_canal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_diario" ADD CONSTRAINT "estoque_diario_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_conta_id_contas_canal_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_canal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anuncios_item_uq" ON "anuncios" USING btree ("cliente_id","item_id");--> statement-breakpoint
CREATE INDEX "anuncios_conta_idx" ON "anuncios" USING btree ("conta_id");--> statement-breakpoint
CREATE UNIQUE INDEX "estoque_diario_uq" ON "estoque_diario" USING btree ("cliente_id","item_id","local","dia");--> statement-breakpoint
CREATE UNIQUE INDEX "pedido_itens_uq" ON "pedido_itens" USING btree ("cliente_id","order_id","item_id","variacao_id");--> statement-breakpoint
CREATE INDEX "pedido_itens_item_idx" ON "pedido_itens" USING btree ("cliente_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_order_uq" ON "pedidos" USING btree ("cliente_id","order_id");--> statement-breakpoint
CREATE INDEX "pedidos_dia_idx" ON "pedidos" USING btree ("cliente_id","dia_venda");