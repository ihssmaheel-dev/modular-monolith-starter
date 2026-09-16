import {
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const intelligenceRunStatusEnum = pgEnum("intelligence_run_status", [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "DEAD_LETTER",
]);
export const intelligenceDocumentStatusEnum = pgEnum("intelligence_document_status", [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
]);

const vector1536 = customType<{ data: number[]; driverData: string }>({
  dataType: () => "vector(1536)",
  toDriver: (value) => `[${value.join(",")}]`,
  fromDriver: (value) =>
    String(value).replace(/^\[/, "").replace(/\]$/, "").split(",").filter(Boolean).map(Number),
});

export const intelligenceRuns = pgTable(
  "intelligence_runs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    requestedBy: text("requested_by").notNull(),
    status: intelligenceRunStatusEnum("status").notNull().default("QUEUED"),
    promptCiphertext: text("prompt_ciphertext").notNull(),
    outputSchema: jsonb("output_schema"),
    documentIds: jsonb("document_ids").notNull().default([]),
    maxOutputTokens: integer("max_output_tokens").notNull().default(2_048),
    model: text("model"),
    resultCiphertext: text("result_ciphertext"),
    errorCode: text("error_code"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 14, scale: 8 })
      .notNull()
      .default("0"),
    citations: jsonb("citations").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("intelligence_runs_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("intelligence_runs_status_idx").on(table.status, table.updatedAt),
  ],
);

export const intelligenceDocuments = pgTable(
  "intelligence_documents",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    fileId: text("file_id").notNull(),
    sourceObjectKey: text("source_object_key").notNull(),
    contentHash: text("content_hash"),
    parserVersion: text("parser_version").notNull().default("text-v1"),
    status: intelligenceDocumentStatusEnum("status").notNull().default("QUEUED"),
    chunkCount: integer("chunk_count").notNull().default(0),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("intelligence_documents_tenant_status_idx").on(table.tenantId, table.status),
    uniqueIndex("intelligence_documents_tenant_file_unique").on(table.tenantId, table.fileId),
  ],
);

export const intelligenceDocumentChunks = pgTable(
  "intelligence_document_chunks",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    documentId: text("document_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    contentCiphertext: text("content_ciphertext").notNull(),
    contentHash: text("content_hash").notNull(),
    embedding: vector1536("embedding"),
    embeddingModel: text("embedding_model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("intelligence_chunks_tenant_document_idx").on(table.tenantId, table.documentId),
    index("intelligence_chunks_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export type IntelligenceRunRow = typeof intelligenceRuns.$inferSelect;
export type IntelligenceDocumentRow = typeof intelligenceDocuments.$inferSelect;
export type IntelligenceDocumentChunkRow = typeof intelligenceDocumentChunks.$inferSelect;
