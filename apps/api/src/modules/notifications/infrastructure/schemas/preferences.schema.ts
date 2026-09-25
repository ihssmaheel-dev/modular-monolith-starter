import { pgTable, text, timestamp, pgEnum, index, boolean, unique } from "drizzle-orm/pg-core";

export const digestCadenceEnum = pgEnum("digest_cadence", ["realtime", "hourly", "daily"]);

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

export type PreferenceRow = typeof notificationPreferences.$inferSelect;
export type NewPreferenceRow = typeof notificationPreferences.$inferInsert;
