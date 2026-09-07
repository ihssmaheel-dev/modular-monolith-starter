import { pgTable, text, timestamp, pgEnum, index, jsonb, boolean } from "drizzle-orm/pg-core";

export const notificationChannelEnum = pgEnum("notification_channel", ["inApp", "email", "push"]);
export const digestCadenceEnum = pgEnum("digest_cadence", ["realtime", "hourly", "daily"]);
export const batchStatusEnum = pgEnum("notification_batch_status", ["open", "delivered"]);

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
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_read_idx").on(t.userId, t.readAt),
    index("notifications_tenant_idx").on(t.tenantId),
    index("notifications_type_idx").on(t.type),
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
  (t) => [index("notification_preferences_user_idx").on(t.userId)],
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
  ],
);

export type NotificationRow = typeof notifications.$inferSelect;
export type PreferenceRow = typeof notificationPreferences.$inferSelect;
export type DeviceTokenRow = typeof deviceTokens.$inferSelect;
export type NotificationBatchRow = typeof notificationBatches.$inferSelect;
