import { Injectable } from "@nestjs/common";
import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { DatabaseService } from "../../../../infrastructure/database";
import { TenantContextService } from "../../../../infrastructure/database";
import { BaseRepository } from "../../../../infrastructure/database";
import { files, type FileRow } from "../schemas/file.schema";
import type { FileEntity } from "../../domain/entities/file.entity";

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
      activeKey: row.activeKey ?? undefined,
      scanClaimToken: row.scanClaimToken ?? undefined,
      scanLeaseExpiresAt: row.scanLeaseExpiresAt ?? undefined,
      scanAttempts: row.scanAttempts,
      scanNextAttemptAt: row.scanNextAttemptAt ?? undefined,
      scanFailureCode: row.scanFailureCode ?? undefined,
      scanSourceEtag: row.scanSourceEtag ?? undefined,
      scanSourceVersionId: row.scanSourceVersionId ?? undefined,
      scanCandidateKeys: row.scanCandidateKeys,
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

  async markUploadReady(
    id: string,
    source: { etag?: string; versionId?: string },
  ): Promise<FileEntity | null> {
    const rows = await this.getDb()
      .update(files)
      .set({
        status: "uploading",
        scanSourceEtag: source.etag ?? null,
        scanSourceVersionId: source.versionId ?? null,
        scanNextAttemptAt: new Date(),
        scanFailureCode: null,
        updatedAt: new Date(),
      })
      .where(and(eq(files.id, id), eq(files.status, "pending"), isNull(files.deletedAt)))
      .returning();
    const row = rows[0];
    return row ? this.toDomain(row) : null;
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
            where: (c: unknown) => {
              orderBy: (column: unknown) => { limit: (n: number) => Promise<FileRow[]> };
            };
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
      .orderBy(asc(files.createdAt))
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
            where: (c: unknown) => {
              orderBy: (column: unknown) => { limit: (n: number) => Promise<FileRow[]> };
            };
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
      .orderBy(asc(files.createdAt))
      .limit(limit);
    return (rows ?? []).map((r) => this.toDomain(r));
  }

  async findUploadedFiles(
    limit: number,
    systemScope = false,
    afterId?: string,
    updatedAfter?: Date,
  ): Promise<FileEntity[]> {
    if (!systemScope || !this.tenantContext.isSystemScope()) return [];
    const db = this.getDb();
    const rows = await (
      db as unknown as {
        select: () => {
          from: (t: unknown) => {
            where: (c: unknown) => {
              orderBy: (column: unknown) => { limit: (value: number) => Promise<FileRow[]> };
            };
          };
        };
      }
    )
      .select()
      .from(files)
      .where(
        and(
          eq(files.status, "uploaded"),
          isNull(files.deletedAt),
          afterId ? gt(files.id, afterId) : undefined,
          updatedAfter ? gte(files.updatedAt, updatedAfter) : undefined,
        ),
      )
      .orderBy(asc(files.id))
      .limit(limit);
    return (rows ?? []).map((r) => this.toDomain(r));
  }

  async claimUploadingFiles(
    limit: number,
    leaseMs: number,
    maxAttempts: number,
    systemScope = false,
  ): Promise<FileEntity[]> {
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
            (status = 'uploading' AND (scan_next_attempt_at IS NULL OR scan_next_attempt_at <= NOW()))
            OR (status = 'scanning' AND scan_lease_expires_at < NOW())
          )
          AND scan_attempts < ${maxAttempts}
        ORDER BY updated_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      ), claims AS (
        SELECT id, md5(random()::text || clock_timestamp()::text || id) AS token
        FROM candidates
      )
      UPDATE files AS target
      SET status = 'scanning',
          scan_claim_token = claims.token,
          scan_lease_expires_at = NOW() + (${leaseMs} * INTERVAL '1 millisecond'),
          scan_attempts = target.scan_attempts + 1,
          scan_failure_code = NULL,
          scan_candidate_keys = COALESCE(target.scan_candidate_keys, '[]'::jsonb)
            || jsonb_build_array(target.key || '.candidate-' || claims.token),
          updated_at = NOW()
      FROM claims
      WHERE target.id = claims.id
      RETURNING
        target.id,
        target.tenant_id AS "tenantId",
        target.key,
        target.file_name AS "fileName",
        target.content_type AS "contentType",
        target.file_size AS "fileSize",
        target.bucket,
        target.parent_id AS "parentId",
        target.parent_type AS "parentType",
        target.slot,
        target.uploaded_by AS "uploadedBy",
        target.status,
        target.active_key AS "activeKey",
        target.scan_claim_token AS "scanClaimToken",
        target.scan_lease_expires_at AS "scanLeaseExpiresAt",
        target.scan_attempts AS "scanAttempts",
        target.scan_next_attempt_at AS "scanNextAttemptAt",
        target.scan_failure_code AS "scanFailureCode",
        target.scan_source_etag AS "scanSourceEtag",
        target.scan_source_version_id AS "scanSourceVersionId",
        target.scan_candidate_keys AS "scanCandidateKeys",
        target.created_at AS "createdAt",
        target.updated_at AS "updatedAt",
        target.deleted_at AS "deletedAt"
    `);
    return result.rows.map((row) => this.toDomain(row));
  }

  async renewScanLease(id: string, claimToken: string, leaseMs: number): Promise<boolean> {
    const result = await this.getDb().execute(sql`UPDATE files
      SET scan_lease_expires_at = NOW() + (${leaseMs} * INTERVAL '1 millisecond'),
          updated_at = NOW()
      WHERE id = ${id}
        AND status = 'scanning'
        AND scan_claim_token = ${claimToken}
        AND deleted_at IS NULL`);
    return (result.rowCount ?? 0) === 1;
  }

  async completeScan(id: string, claimToken: string, activeKey: string): Promise<boolean> {
    const result = await this.getDb().execute(sql`UPDATE files
      SET status = 'uploaded',
          active_key = ${activeKey},
          scan_claim_token = NULL,
          scan_lease_expires_at = NULL,
          scan_next_attempt_at = NULL,
          scan_failure_code = NULL,
          updated_at = NOW()
      WHERE id = ${id}
        AND status = 'scanning'
        AND scan_claim_token = ${claimToken}
        AND deleted_at IS NULL`);
    return (result.rowCount ?? 0) === 1;
  }

  async retryScan(
    id: string,
    claimToken: string,
    failureCode: string,
    nextAttemptAt: Date,
    maxAttempts: number,
  ): Promise<boolean> {
    const result = await this.getDb().execute(sql`UPDATE files
      SET status = CASE WHEN scan_attempts >= ${maxAttempts} THEN 'failed'::file_status
                        ELSE 'uploading'::file_status END,
          scan_claim_token = NULL,
          scan_lease_expires_at = NULL,
          scan_next_attempt_at = CASE WHEN scan_attempts >= ${maxAttempts}
                                     THEN NULL ELSE ${nextAttemptAt} END,
          scan_failure_code = ${failureCode},
          updated_at = NOW()
      WHERE id = ${id}
        AND status = 'scanning'
        AND scan_claim_token = ${claimToken}
        AND deleted_at IS NULL`);
    return (result.rowCount ?? 0) === 1;
  }

  async rejectScan(id: string, claimToken: string, failureCode: string): Promise<boolean> {
    const result = await this.getDb().execute(sql`UPDATE files
      SET status = 'failed',
          scan_claim_token = NULL,
          scan_lease_expires_at = NULL,
          scan_next_attempt_at = NULL,
          scan_failure_code = ${failureCode},
          updated_at = NOW()
      WHERE id = ${id}
        AND status = 'scanning'
        AND scan_claim_token = ${claimToken}
        AND deleted_at IS NULL`);
    return (result.rowCount ?? 0) === 1;
  }

  async findDeletedFiles(limit: number, systemScope = false): Promise<FileEntity[]> {
    if (!systemScope || !this.tenantContext.isSystemScope()) return [];
    const db = this.getDb();
    const rows = await (
      db as unknown as {
        select: () => {
          from: (t: unknown) => {
            where: (c: unknown) => {
              orderBy: (column: unknown) => { limit: (value: number) => Promise<FileRow[]> };
            };
          };
        };
      }
    )
      .select()
      .from(files)
      .where(isNotNull(files.deletedAt))
      .orderBy(asc(files.deletedAt))
      .limit(limit);
    return (rows ?? []).map((r) => this.toDomain(r));
  }

  async getActiveUsage(
    uploadedBy: string,
    tenantId?: string,
  ): Promise<{ userBytes: number; tenantBytes: number; tenantObjects: number }> {
    const activeTenantId = tenantId ?? this.tenantContext?.get()?.tenantId;
    const db = this.getDb();
    const result = await (
      db as unknown as {
        execute: (query: unknown) => Promise<{
          rows: Array<{
            userBytes: number | string;
            tenantBytes: number | string;
            tenantObjects: number | string;
          }>;
        }>;
      }
    ).execute(
      sql`select
        coalesce(sum(file_size) filter (where uploaded_by = ${uploadedBy}), 0) as "userBytes",
        coalesce(sum(file_size), 0) as "tenantBytes",
        count(*) as "tenantObjects"
      from files
      where deleted_at is null ${activeTenantId ? sql`and tenant_id = ${activeTenantId}` : sql``}`,
    );
    const row = result.rows[0];
    return {
      userBytes: Number(row?.userBytes ?? 0),
      tenantBytes: Number(row?.tenantBytes ?? 0),
      tenantObjects: Number(row?.tenantObjects ?? 0),
    };
  }

  async getGlobalUserActiveBytes(uploadedBy: string, systemScope = false): Promise<number> {
    if (!systemScope || !this.tenantContext.isSystemScope()) return 0;
    const result = await this.getDb().execute(sql`select coalesce(sum(file_size), 0) as bytes
      from files
      where uploaded_by = ${uploadedBy} and deleted_at is null`);
    return Number((result.rows[0] as { bytes?: number | string } | undefined)?.bytes ?? 0);
  }
}
