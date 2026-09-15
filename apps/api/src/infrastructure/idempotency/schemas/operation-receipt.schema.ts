import { index, jsonb, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

export const operationReceiptStatusEnum = pgEnum("operation_receipt_status", [
  "PROCESSING",
  "COMPLETED",
]);

export const operationReceipts = pgTable(
  "operation_receipts",
  {
    id: text("id").primaryKey(),
    operationId: text("operation_id").notNull(),
    operationType: text("operation_type").notNull(),
    scopeId: text("scope_id").notNull(),
    actorId: text("actor_id"),
    tenantId: text("tenant_id"),
    requestHash: text("request_hash").notNull(),
    status: operationReceiptStatusEnum("status").notNull().default("PROCESSING"),
    result: jsonb("result"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    unique("operation_receipt_identity_unique").on(
      table.operationType,
      table.scopeId,
      table.operationId,
    ),
    index("operation_receipt_expiry_idx").on(table.expiresAt),
    index("operation_receipt_actor_idx").on(table.actorId, table.createdAt),
    index("operation_receipt_tenant_idx").on(table.tenantId, table.createdAt),
  ],
);

export type OperationReceiptRow = typeof operationReceipts.$inferSelect;
