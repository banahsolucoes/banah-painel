import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Regra do modelo: toda tabela de negócio carrega cliente_id.
 * Fase 0 cria a fundação (clientes, usuários, contas, fila, coletas, conferências).
 * Tabelas de anúncios, pedidos e estoque entram na Fase 1.
 */

const criadoEm = () => timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = () =>
  timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow();

export const papelUsuario = pgEnum("papel_usuario", ["admin", "equipe", "dono"]);
export const canal = pgEnum("canal", ["MELI", "SHOPEE", "BLING"]);
export const statusConta = pgEnum("status_conta", ["ativa", "revogada", "erro"]);
export const statusJob = pgEnum("status_job", ["pendente", "executando", "concluido", "falhou"]);
export const statusColeta = pgEnum("status_coleta", ["executando", "ok", "erro"]);

export const clientes = pgTable("clientes", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  plano: text("plano").notNull().default("interno"),
  /** Pesos da saúde, prazos de reposição padrão, capacidade do Full, limites dos agentes. */
  config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});

/** id = id do usuário no Supabase Auth (auth.users.id). */
export const usuarios = pgTable(
  "usuarios",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    papel: papelUsuario("papel").notNull().default("dono"),
    /** Preenchido só para dono: o cliente que ele enxerga. */
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex("usuarios_email_uq").on(t.email)],
);

export const contasCanal = pgTable(
  "contas_canal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    canal: canal("canal").notNull(),
    /** user_id do vendedor no ML, shop_id na Shopee. */
    sellerId: text("seller_id").notNull(),
    apelido: text("apelido"),
    accessTokenCifrado: text("access_token_cifrado").notNull(),
    refreshTokenCifrado: text("refresh_token_cifrado").notNull(),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    escopos: text("escopos"),
    status: statusConta("status").notNull().default("ativa"),
    ultimoErro: text("ultimo_erro"),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    // Uma conta de marketplace pertence a um único cliente.
    uniqueIndex("contas_canal_seller_uq").on(t.canal, t.sellerId),
    index("contas_canal_cliente_idx").on(t.clienteId),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    /** cliente + tipo + período/item. Disparar duas vezes não duplica. */
    chaveUnica: text("chave_unica").notNull(),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    status: statusJob("status").notNull().default("pendente"),
    tentativas: integer("tentativas").notNull().default(0),
    executarEm: timestamp("executar_em", { withTimezone: true }).notNull().defaultNow(),
    reservadoEm: timestamp("reservado_em", { withTimezone: true }),
    ultimoErro: text("ultimo_erro"),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex("jobs_chave_uq").on(t.chaveUnica),
    index("jobs_fila_idx").on(t.status, t.executarEm),
    index("jobs_cliente_idx").on(t.clienteId),
  ],
);

export const coletas = pgTable(
  "coletas",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    contaId: uuid("conta_id").references(() => contasCanal.id, { onDelete: "set null" }),
    tipo: text("tipo").notNull(),
    jobId: bigint("job_id", { mode: "number" }),
    inicio: timestamp("inicio", { withTimezone: true }).notNull().defaultNow(),
    fim: timestamp("fim", { withTimezone: true }),
    status: statusColeta("status").notNull().default("executando"),
    /** Quantos registros a API disse que existiam x quantos foram gravados. */
    totalApi: integer("total_api"),
    gravados: integer("gravados"),
    /** Caminho do JSON bruto compactado no Storage (apagado após 90 dias). */
    arquivoBruto: text("arquivo_bruto"),
    erro: text("erro"),
  },
  (t) => [index("coletas_cliente_idx").on(t.clienteId, t.inicio)],
);

export const conferencias = pgTable(
  "conferencias",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    dia: date("dia").notNull(),
    tipo: text("tipo").notNull(),
    esperado: integer("esperado"),
    obtido: integer("obtido"),
    ok: boolean("ok").notNull(),
    detalhe: jsonb("detalhe").notNull().default(sql`'{}'::jsonb`),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex("conferencias_uq").on(t.clienteId, t.dia, t.tipo)],
);

/** Toda ação sugerida, aprovada ou executada (humana ou de agente). Auditoria. */
export const acoes = pgTable(
  "acoes",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    agente: text("agente").notNull(),
    tipo: text("tipo").notNull(),
    status: text("status").notNull(),
    modoSeco: boolean("modo_seco").notNull(),
    alvo: text("alvo"),
    dados: jsonb("dados").notNull().default(sql`'{}'::jsonb`),
    autor: text("autor").notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [index("acoes_cliente_idx").on(t.clienteId, t.criadoEm)],
);

// ── Fase 1: anúncios, pedidos e estoque ────────────────────────────────────

/** Um anúncio do canal. O histórico é sempre agrupado por item_id, nunca por SKU. */
export const anuncios = pgTable(
  "anuncios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    contaId: uuid("conta_id")
      .notNull()
      .references(() => contasCanal.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    titulo: text("titulo").notNull(),
    sku: text("sku"),
    precoCentavos: integer("preco_centavos").notNull(),
    status: text("status").notNull(),
    /** fulfillment = Full; cross_docking, xd_drop_off, self_service (Flex) etc. */
    logistica: text("logistica"),
    catalogo: boolean("catalogo").notNull().default(false),
    catalogProductId: text("catalog_product_id"),
    permalink: text("permalink"),
    thumbnail: text("thumbnail"),
    /** Data de criação do anúncio no canal: limita o histórico de vendas possível. */
    canalCriadoEm: timestamp("canal_criado_em", { withTimezone: true }),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex("anuncios_item_uq").on(t.clienteId, t.itemId),
    index("anuncios_conta_idx").on(t.contaId),
  ],
);

export const pedidos = pgTable(
  "pedidos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    contaId: uuid("conta_id")
      .notNull()
      .references(() => contasCanal.id, { onDelete: "cascade" }),
    orderId: text("order_id").notNull(),
    packId: text("pack_id"),
    status: text("status").notNull(),
    totalCentavos: integer("total_centavos").notNull(),
    canalCriadoEm: timestamp("canal_criado_em", { withTimezone: true }).notNull(),
    canalAtualizadoEm: timestamp("canal_atualizado_em", { withTimezone: true }),
    /** Dia da venda no fuso de São Paulo. */
    diaVenda: date("dia_venda").notNull(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex("pedidos_order_uq").on(t.clienteId, t.orderId),
    index("pedidos_dia_idx").on(t.clienteId, t.diaVenda),
  ],
);

export const pedidoItens = pgTable(
  "pedido_itens",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    orderId: text("order_id").notNull(),
    itemId: text("item_id").notNull(),
    /** "" quando o anúncio não tem variação (permite chave única). */
    variacaoId: text("variacao_id").notNull().default(""),
    sku: text("sku"),
    titulo: text("titulo"),
    quantidade: integer("quantidade").notNull(),
    precoUnitCentavos: integer("preco_unit_centavos").notNull(),
  },
  (t) => [
    uniqueIndex("pedido_itens_uq").on(t.clienteId, t.orderId, t.itemId, t.variacaoId),
    index("pedido_itens_item_idx").on(t.clienteId, t.itemId),
  ],
);

/** Uma foto do estoque por anúncio, por local, por dia. */
export const estoqueDiario = pgTable(
  "estoque_diario",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    /** FULL_ML, FULL_SHOPEE ou PROPRIO */
    local: text("local").notNull(),
    dia: date("dia").notNull(),
    disponivel: integer("disponivel").notNull(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [uniqueIndex("estoque_diario_uq").on(t.clienteId, t.itemId, t.local, t.dia)],
);
