import { pgTable, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations.schema";

export const invitationRoleEnum = pgEnum("invitation_role", ["admin", "member"]);
export const invitationStatusEnum = pgEnum("invitation_status", ["pending", "accepted", "revoked"]);

export const invitations = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: invitationRoleEnum("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedBy: text("invited_by").notNull(),
    status: invitationStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedBy: text("accepted_by"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("invitations_tenant_email_status_idx").on(t.tenantId, t.email, t.status),
    index("invitations_token_hash_idx").on(t.tokenHash),
    index("invitations_expires_at_idx").on(t.expiresAt),
    index("invitations_retention_idx").on(t.updatedAt, t.status, t.expiresAt),
  ],
);

export type InvitationRow = typeof invitations.$inferSelect;
export type NewInvitationRow = typeof invitations.$inferInsert;
