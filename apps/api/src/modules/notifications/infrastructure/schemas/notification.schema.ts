import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  index,
  jsonb,
  boolean,
  integer,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const notificationChannelEnum = pgEnum("notification_channel", ["inApp", "email", "push"]);
export const digestCadenceEnum = pgEnum("digest_cadence", ["realtime", "hourly", "daily"]);
export const batchStatusEnum = pgEnum("notification_batch_status", ["open", "delivered"]);
export const deliveryStatusEnum = pgEnum("notification_delivery_status", [
  "pending",
  "processing",
  "delivered",
  "dead",
]);

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
    index("notification_delivery_user_idx").on(t.userId),
    index("notification_delivery_tenant_idx").on(t.tenantId),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    category: text("category").notNull(),
    inApp: boolean("in_app").notNull().default(true),
    email: boolean("email").notNull().default(true),
    push: boolean("push").notNull().default(true),
    digestCadence: digestCadenceEnum("digest_cadence").notNull().default("realtime"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notification_preferences_user_idx").on(t.userId),
    unique("notification_preferences_user_category_unique").on(t.userId, t.category),
  ],
);

export const deviceTokens = pgTable(
  "device_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    platform: text("platform").notNull(),
    provider: text("provider").notNull().default("expo"),
    token: text("token").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("device_tokens_user_idx").on(t.userId),
    index("device_tokens_token_idx").on(t.token),
    unique("device_tokens_user_token_unique").on(t.userId, t.token),
  ],
);

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

export type NotificationRow = typeof notifications.$inferSelect;
export type PreferenceRow = typeof notificationPreferences.$inferSelect;
export type DeviceTokenRow = typeof deviceTokens.$inferSelect;
export type NotificationBatchRow = typeof notificationBatches.$inferSelect;
export type NotificationDeliveryIntentRow = typeof notificationDeliveryIntents.$inferSelect;
