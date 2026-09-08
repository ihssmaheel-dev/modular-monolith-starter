import { pgTable, text, timestamp, pgEnum, integer, index, jsonb } from "drizzle-orm/pg-core";

export const outboxStatusEnum = pgEnum("outbox_status", [
  "PENDING",
  "PROCESSING",
  "PUBLISHED",
  "FAILED",
  "DEAD_LETTER",
]);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id"),
    topic: text("topic").notNull(),
    payload: jsonb("payload").notNull(),
    status: outboxStatusEnum("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("outbox_status_next_attempt_idx").on(t.status, t.nextAttemptAt),
    index("outbox_status_locked_idx").on(t.status, t.lockedAt),
    index("outbox_status_updated_idx").on(t.status, t.updatedAt),
    index("outbox_tenant_id_idx").on(t.tenantId),
    index("outbox_topic_idx").on(t.topic),
  ],
);

export type OutboxRow = typeof outboxEvents.$inferSelect;
