import { pgTable, text, timestamp, index, unique } from "drizzle-orm/pg-core";

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

export type DeviceTokenRow = typeof deviceTokens.$inferSelect;
export type NewDeviceTokenRow = typeof deviceTokens.$inferInsert;
