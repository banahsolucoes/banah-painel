CREATE TABLE "ads_diario" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ads_diario_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"cliente_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"dia" date NOT NULL,
	"cliques" integer DEFAULT 0 NOT NULL,
	"impressoes" integer DEFAULT 0 NOT NULL,
	"custo_centavos" integer DEFAULT 0 NOT NULL,
	"receita_centavos" integer DEFAULT 0 NOT NULL,
	"unidades" integer DEFAULT 0 NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "produtos_custo" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "produtos_custo_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"cliente_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"custo_centavos" integer NOT NULL,
	"origem" text DEFAULT 'planilha' NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reputacao_diaria" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reputacao_diaria_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"cliente_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"dia" date NOT NULL,
	"nivel" text,
	"medalha" text,
	"reclamacoes_taxa" double precision,
	"atrasos_taxa" double precision,
	"cancelamentos_taxa" double precision,
	"vendas_periodo" integer,
	"avaliacoes_positivas" double precision,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contas_canal" ADD COLUMN "ads_advertiser_id" text;--> statement-breakpoint
ALTER TABLE "contas_canal" ADD COLUMN "ads_status" text;--> statement-breakpoint
ALTER TABLE "pedido_itens" ADD COLUMN "tarifa_unit_centavos" integer;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "shipping_id" text;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "tarifas_centavos" integer;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "frete_vendedor_centavos" integer;--> statement-breakpoint
ALTER TABLE "ads_diario" ADD CONSTRAINT "ads_diario_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_custo" ADD CONSTRAINT "produtos_custo_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputacao_diaria" ADD CONSTRAINT "reputacao_diaria_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputacao_diaria" ADD CONSTRAINT "reputacao_diaria_conta_id_contas_canal_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_canal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ads_diario_uq" ON "ads_diario" USING btree ("cliente_id","item_id","dia");--> statement-breakpoint
CREATE UNIQUE INDEX "produtos_custo_uq" ON "produtos_custo" USING btree ("cliente_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "reputacao_diaria_uq" ON "reputacao_diaria" USING btree ("conta_id","dia");