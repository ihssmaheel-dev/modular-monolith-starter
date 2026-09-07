import { Injectable } from "@nestjs/common";
import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { DatabaseService } from "../../../infrastructure/database";
import { TenantContextService } from "../../../infrastructure/database";
import { BaseRepository } from "../../../infrastructure/database";
import { files, type FileRow } from "./schemas/file.schema";
import type { FileEntity } from "../domain/entities/file.entity";

@Injectable()
export class FilesRepository extends BaseRepository<FileEntity, FileRow> {
  constructor(database: DatabaseService, tenantContext: TenantContextService) {
    super(files, database, tenantContext, true);
  }

  protected toDomain(row: FileRow): FileEntity {
    return {
      id: row.id,
      tenantId: row.tenantId ?? undefined,
      key: row.key,
      fileName: row.fileName,
      contentType: row.contentType,
      fileSize: row.fileSize,
      bucket: row.bucket,
      parentId: row.parentId ?? undefined,
      parentType: row.parentType as FileEntity["parentType"],
      slot: row.slot ?? null,
      uploadedBy: row.uploadedBy,
      status: row.status as FileEntity["status"],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findByKey(key: string): Promise<FileEntity | null> {
    const result = await this.findOne({ key });
    return result.isOk() ? result.value : null;
  }

  async findByParent(parentType: string, parentId: string): Promise<FileEntity[]> {
    const result = await this.find({ parentType, parentId });
    return result.isOk() ? result.value : [];
  }

  async findByUploader(uploadedBy: string, limit = 1000): Promise<FileEntity[]> {
    const result = await this.paginate({ uploadedBy }, { page: 1, limit });
    return result.isOk() ? result.value.items : [];
  }

  async claimPendingUpload(key: string) {
    return this.updateOne({ key, status: "pending" }, { status: "uploading" });
  }

  async findPendingFilesBefore(
    cutoff: Date,
    systemScope = false,
    limit = 100,
  ): Promise<FileEntity[]> {
    if (!systemScope || !this.tenantContext.isSystemScope()) return [];
    const db = this.getDb();
    const rows = await (
      db as unknown as {
        select: () => {
          from: (t: unknown) => {
            where: (c: unknown) => { limit: (n: number) => Promise<FileRow[]> };
          };
        };
      }
    )
      .select()
      .from(files)
      .where(
        and(
          inArray(files.status, ["pending", "uploading", "scanning", "failed"]),
          isNull(files.deletedAt),
          lt(files.createdAt, cutoff),
        ),
      )
      .limit(limit);
    return (rows ?? []).map((r) => this.toDomain(r));
  }

  async findUnlinkedBefore(cutoff: Date, systemScope = false, limit = 100): Promise<FileEntity[]> {
    if (!systemScope || !this.tenantContext.isSystemScope()) return [];
    const db = this.getDb();
    const rows = await (
      db as unknown as {
        select: () => {
          from: (t: unknown) => {
            where: (c: unknown) => { limit: (n: number) => Promise<FileRow[]> };
          };
        };
      }
    )
      .select()
      .from(files)
      .where(
        and(
          eq(files.status, "uploaded"),
          isNull(files.parentId),
          isNull(files.deletedAt),
          lt(files.createdAt, cutoff),
        ),
      )
      .limit(limit);
    return (rows ?? []).map((r) => this.toDomain(r));
  }

  async findUploadedFiles(limit: number, systemScope = false): Promise<FileEntity[]> {
    if (!systemScope || !this.tenantContext.isSystemScope()) return [];
    const db = this.getDb();
    const rows = await (
      db as unknown as {
        select: () => {
          from: (t: unknown) => {
            where: (c: unknown) => { limit: (value: number) => Promise<FileRow[]> };
          };
        };
      }
    )
      .select()
      .from(files)
      .where(and(eq(files.status, "uploaded"), isNull(files.deletedAt)))
      .limit(limit);
    return (rows ?? []).map((r) => this.toDomain(r));
  }

  async claimUploadingFiles(limit: number, systemScope = false): Promise<FileEntity[]> {
    if (!systemScope || !this.tenantContext.isSystemScope()) return [];
    const db = this.getDb();
    const result = await (
      db as unknown as { execute: (query: unknown) => Promise<{ rows: FileRow[] }> }
    ).execute(sql`
      WITH candidates AS (
        SELECT id
        FROM files
        WHERE deleted_at IS NULL
          AND (
            status = 'uploading'
            OR (status = 'scanning' AND updated_at < NOW() - INTERVAL '10 minutes')
          )
        ORDER BY updated_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE files
      SET status = 'scanning', updated_at = NOW()
      WHERE id IN (SELECT id FROM candidates)
      RETURNING
        id,
        tenant_id AS "tenantId",
        key,
        file_name AS "fileName",
        content_type AS "contentType",
        file_size AS "fileSize",
        bucket,
        parent_id AS "parentId",
        parent_type AS "parentType",
        uploaded_by AS "uploadedBy",
        status,
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        deleted_at AS "deletedAt"
    `);
    return result.rows.map((row) => this.toDomain(row));
  }

  async findDeletedFiles(limit: number, systemScope = false): Promise<FileEntity[]> {
    if (!systemScope || !this.tenantContext.isSystemScope()) return [];
    const db = this.getDb();
    const rows = await (
      db as unknown as {
        select: () => {
          from: (t: unknown) => {
            where: (c: unknown) => { limit: (value: number) => Promise<FileRow[]> };
          };
        };
      }
    )
      .select()
      .from(files)
      .where(isNotNull(files.deletedAt))
      .limit(limit);
    return (rows ?? []).map((r) => this.toDomain(r));
  }

  async sumActiveBytes(uploadedBy: string): Promise<number> {
    const db = this.getDb();
    const result = await (
      db as unknown as {
        execute: (query: unknown) => Promise<{ rows: Array<{ total: number | string }> }>;
      }
    ).execute(
      sql`select coalesce(sum(file_size), 0) as total from files where uploaded_by = ${uploadedBy} and deleted_at is null`,
    );
    return Number(result.rows[0]?.total ?? 0);
  }
}
