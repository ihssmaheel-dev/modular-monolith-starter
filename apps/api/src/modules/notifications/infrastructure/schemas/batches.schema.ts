import { pgTable, text, timestamp, pgEnum, index, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const batchStatusEnum = pgEnum("notification_batch_status", ["open", "delivered"]);

export const notificationBatches = pgTable(
  "notification_batches",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tenantId: text("tenant_id"),
    type: text("type").notNull(),
    groupingKey: text("grouping_key").notNull(),
    items: jsonb("items").notNull().default([]),
    status: batchStatusEnum("status").notNull().default("open"),
    windowEndsAt: timestamp("window_ends_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notification_batches_open_idx").on(t.status, t.windowEndsAt),
    index("notification_batches_user_idx").on(t.userId),
    index("notification_batches_user_grouping_status_idx").on(t.userId, t.groupingKey, t.status),
    uniqueIndex("notification_batches_open_grouping_unique")
      .on(t.userId, t.groupingKey)
      .where(sql`"status" = 'open'`),
  ],
);

export type NotificationBatchRow = typeof notificationBatches.$inferSelect;
export type NewNotificationBatchRow = typeof notificationBatches.$inferInsert;
