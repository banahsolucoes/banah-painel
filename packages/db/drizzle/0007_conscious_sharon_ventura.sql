ALTER TABLE "anuncios" ADD COLUMN "tipo_anuncio" text;--> statement-breakpoint
ALTER TABLE "anuncios" ADD COLUMN "categoria_id" text;--> statement-breakpoint
ALTER TABLE "anuncios" ADD COLUMN "frete_gratis" boolean;--> statement-breakpoint
ALTER TABLE "anuncios" ADD COLUMN "tarifa_centavos" integer;--> statement-breakpoint
ALTER TABLE "anuncios" ADD COLUMN "tarifa_pct" double precision;--> statement-breakpoint
ALTER TABLE "anuncios" ADD COLUMN "frete_custo_centavos" integer;