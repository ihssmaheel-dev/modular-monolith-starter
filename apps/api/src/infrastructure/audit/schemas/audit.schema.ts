import { pgTable, text, timestamp, pgEnum, index, jsonb } from "drizzle-orm/pg-core";

export const auditActionEnum = pgEnum("audit_action", ["CREATE", "UPDATE", "DELETE"]);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    collectionName: text("collection_name").notNull(),
    documentId: text("document_id").notNull(),
    action: auditActionEnum("action").notNull(),
    actorId: text("actor_id"),
    tenantId: text("tenant_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("audit_collection_created_idx").on(t.collectionName, t.createdAt),
    index("audit_document_id_idx").on(t.documentId),
    index("audit_created_at_idx").on(t.createdAt),
  ],
);

export type AuditRow = typeof auditLogs.$inferSelect;
