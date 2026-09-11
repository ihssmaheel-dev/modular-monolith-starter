import { pgTable, text, timestamp, integer, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "user"]);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordResetTokenHash: text("password_reset_token_hash"),
    passwordResetExpiresAt: timestamp("password_reset_expires_at", { withTimezone: true }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    emailVerificationTokenHash: text("email_verification_token_hash"),
    emailVerificationExpiresAt: timestamp("email_verification_expires_at", { withTimezone: true }),
    role: userRoleEnum("role").notNull().default("user"),
    avatarFileId: text("avatar_file_id"),
    authVersion: integer("auth_version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    index("users_avatar_file_id_idx").on(t.avatarFileId),
    index("users_deleted_at_idx").on(t.deletedAt),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
