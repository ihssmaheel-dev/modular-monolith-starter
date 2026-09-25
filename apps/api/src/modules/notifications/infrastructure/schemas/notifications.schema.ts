import { pgTable, text, timestamp, index, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tenantId: text("tenant_id"),
    type: text("type").notNull(),
    category: text("category").notNull(),
    titleKey: text("title_key").notNull(),
    titleParams: jsonb("title_params"),
    data: jsonb("data"),
    channels: jsonb("channels").notNull().default([]),
    deliveredChannels: jsonb("delivered_channels").notNull().default([]),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_read_idx").on(t.userId, t.readAt),
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
    index("notifications_digest_batch_idx")
      .on(sql`(("data" ->> 'batchId'))`)
      .where(sql`(("data" ->> 'batchId')) IS NOT NULL`),
    index("notifications_tenant_idx").on(t.tenantId),
    index("notifications_type_idx").on(t.type),
  ],
);

export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;
