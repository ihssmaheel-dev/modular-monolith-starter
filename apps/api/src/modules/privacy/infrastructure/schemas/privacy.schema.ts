import { pgTable, text, timestamp, pgEnum, index, integer, jsonb } from "drizzle-orm/pg-core";

export const dsrTypeEnum = pgEnum("dsr_type", [
  "EXPORT",
  "ACCOUNT_ERASURE",
  "ORGANIZATION_ERASURE",
]);

export const dsrStatusEnum = pgEnum("dsr_status", [
  "REQUESTED",
  "PROCESSING",
  "READY",
  "PARTIAL",
  "FULFILLED",
  "EXPIRED",
  "FAILED",
]);

export const dsrRequests = pgTable(
  "dsr_requests",
  {
    id: text("id").primaryKey(),
    type: dsrTypeEnum("type").notNull(),
    status: dsrStatusEnum("status").notNull().default("REQUESTED"),
    subjectUserId: text("subject_user_id").notNull(),
    tenantId: text("tenant_id"),
    payload: jsonb("payload"),
    attempts: integer("attempts").notNull().default(0),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("dsr_subject_idx").on(t.subjectUserId),
    index("dsr_status_expires_idx").on(t.status, t.expiresAt),
    index("dsr_export_work_idx").on(t.type, t.status, t.lockedAt, t.createdAt),
    index("dsr_tenant_idx").on(t.tenantId),
  ],
);

export type DsrRow = typeof dsrRequests.$inferSelect;
