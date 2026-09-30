import { pgTable, text, timestamp, pgEnum, index, integer, unique } from "drizzle-orm/pg-core";
import { notifications } from "./notifications.schema";

export const notificationChannelEnum = pgEnum("notification_channel", ["inApp", "email", "push"]);
export const deliveryStatusEnum = pgEnum("notification_delivery_status", [
  "pending",
  "processing",
  "delivered",
  "dead",
]);

export const notificationDeliveryIntents = pgTable(
  "notification_delivery_intents",
  {
    id: text("id").primaryKey(),
    notificationId: text("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    tenantId: text("tenant_id"),
    channel: notificationChannelEnum("channel").notNull(),
    status: deliveryStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("notification_delivery_channel_unique").on(t.notificationId, t.channel),
    index("notification_delivery_pending_idx").on(t.status, t.nextAttemptAt, t.createdAt),
    index("notification_delivery_retention_idx").on(t.status, t.updatedAt),
    index("notification_delivery_user_idx").on(t.userId),
    index("notification_delivery_tenant_idx").on(t.tenantId),
  ],
);

export type NotificationDeliveryIntentRow = typeof notificationDeliveryIntents.$inferSelect;
export type NewNotificationDeliveryIntentRow = typeof notificationDeliveryIntents.$inferInsert;
