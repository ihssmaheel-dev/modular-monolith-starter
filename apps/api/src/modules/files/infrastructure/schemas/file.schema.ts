import { pgTable, text, timestamp, integer, pgEnum, index, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const fileParentTypeEnum = pgEnum("file_parent_type", ["note", "user", "general"]);
export const fileStatusEnum = pgEnum("file_status", [
  "pending",
  "uploading",
  "scanning",
  "uploaded",
  "failed",
]);

export const files = pgTable(
  "files",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id"),
    key: text("key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    fileSize: integer("file_size").notNull(),
    bucket: text("bucket").notNull(),
    parentId: text("parent_id"),
    parentType: fileParentTypeEnum("parent_type").notNull().default("general"),
    slot: text("slot"),
    uploadedBy: text("uploaded_by").notNull(),
    status: fileStatusEnum("status").notNull().default("pending"),
    activeKey: text("active_key"),
    scanClaimToken: text("scan_claim_token"),
    scanLeaseExpiresAt: timestamp("scan_lease_expires_at", { withTimezone: true }),
    scanAttempts: integer("scan_attempts").notNull().default(0),
    scanNextAttemptAt: timestamp("scan_next_attempt_at", { withTimezone: true }),
    scanFailureCode: text("scan_failure_code"),
    scanSourceEtag: text("scan_source_etag"),
    scanSourceVersionId: text("scan_source_version_id"),
    scanCandidateKeys: jsonb("scan_candidate_keys")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("files_tenant_parent_idx").on(t.tenantId, t.parentType, t.parentId),
    index("files_parent_slot_idx").on(t.parentType, t.parentId, t.slot),
    index("files_uploaded_by_idx").on(t.uploadedBy),
    index("files_status_created_idx").on(t.status, t.createdAt),
    index("files_scan_due_idx").on(t.status, t.scanNextAttemptAt, t.scanLeaseExpiresAt),
    index("files_uploader_active_idx")
      .on(t.uploadedBy)
      .where(sql`"deleted_at" IS NULL`),
    index("files_tenant_active_idx")
      .on(t.tenantId)
      .where(sql`"deleted_at" IS NULL`),
    index("files_key_idx").on(t.key),
    index("files_deleted_at_idx").on(t.deletedAt),
  ],
);

export type FileRow = typeof files.$inferSelect;
