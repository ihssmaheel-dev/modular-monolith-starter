import { pgTable, text, timestamp, integer, pgEnum, index } from "drizzle-orm/pg-core";

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("files_tenant_parent_idx").on(t.tenantId, t.parentType, t.parentId),
    index("files_parent_slot_idx").on(t.parentType, t.parentId, t.slot),
    index("files_uploaded_by_idx").on(t.uploadedBy),
    index("files_key_idx").on(t.key),
    index("files_deleted_at_idx").on(t.deletedAt),
  ],
);

export type FileRow = typeof files.$inferSelect;
