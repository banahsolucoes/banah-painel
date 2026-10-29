CREATE TYPE "public"."canal" AS ENUM('MELI', 'SHOPEE', 'BLING');--> statement-breakpoint
CREATE TYPE "public"."papel_usuario" AS ENUM('admin', 'equipe', 'dono');--> statement-breakpoint
CREATE TYPE "public"."status_coleta" AS ENUM('executando', 'ok', 'erro');--> statement-breakpoint
CREATE TYPE "public"."status_conta" AS ENUM('ativa', 'revogada', 'erro');--> statement-breakpoint
CREATE TYPE "public"."status_job" AS ENUM('pendente', 'executando', 'concluido', 'falhou');--> statement-breakpoint
CREATE TABLE "acoes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "acoes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"cliente_id" uuid NOT NULL,
	"agente" text NOT NULL,
	"tipo" text NOT NULL,
	"status" text NOT NULL,
	"modo_seco" boolean NOT NULL,
	"alvo" text,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"autor" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"plano" text DEFAULT 'interno' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coletas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "coletas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"cliente_id" uuid NOT NULL,
	"conta_id" uuid,
	"tipo" text NOT NULL,
	"job_id" bigint,
	"inicio" timestamp with time zone DEFAULT now() NOT NULL,
	"fim" timestamp with time zone,
	"status" "status_coleta" DEFAULT 'executando' NOT NULL,
	"total_api" integer,
	"gravados" integer,
	"arquivo_bruto" text,
	"erro" text
);
--> statement-breakpoint
CREATE TABLE "conferencias" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "conferencias_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"cliente_id" uuid NOT NULL,
	"dia" date NOT NULL,
	"tipo" text NOT NULL,
	"esperado" integer,
	"obtido" integer,
	"ok" boolean NOT NULL,
	"detalhe" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contas_canal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"canal" "canal" NOT NULL,
	"seller_id" text NOT NULL,
	"apelido" text,
	"access_token_cifrado" text NOT NULL,
	"refresh_token_cifrado" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"escopos" text,
	"status" "status_conta" DEFAULT 'ativa' NOT NULL,
	"ultimo_erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"cliente_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"chave_unica" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "status_job" DEFAULT 'pendente' NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"executar_em" timestamp with time zone DEFAULT now() NOT NULL,
	"reservado_em" timestamp with time zone,
	"ultimo_erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"papel" "papel_usuario" DEFAULT 'dono' NOT NULL,
	"cliente_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acoes" ADD CONSTRAINT "acoes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coletas" ADD CONSTRAINT "coletas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coletas" ADD CONSTRAINT "coletas_conta_id_contas_canal_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_canal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conferencias" ADD CONSTRAINT "conferencias_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_canal" ADD CONSTRAINT "contas_canal_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acoes_cliente_idx" ON "acoes" USING btree ("cliente_id","criado_em");--> statement-breakpoint
CREATE INDEX "coletas_cliente_idx" ON "coletas" USING btree ("cliente_id","inicio");--> statement-breakpoint
CREATE UNIQUE INDEX "conferencias_uq" ON "conferencias" USING btree ("cliente_id","dia","tipo");--> statement-breakpoint
CREATE UNIQUE INDEX "contas_canal_seller_uq" ON "contas_canal" USING btree ("canal","seller_id");--> statement-breakpoint
CREATE INDEX "contas_canal_cliente_idx" ON "contas_canal" USING btree ("cliente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_chave_uq" ON "jobs" USING btree ("chave_unica");--> statement-breakpoint
CREATE INDEX "jobs_fila_idx" ON "jobs" USING btree ("status","executar_em");--> statement-breakpoint
CREATE INDEX "jobs_cliente_idx" ON "jobs" USING btree ("cliente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_uq" ON "usuarios" USING btree ("email");