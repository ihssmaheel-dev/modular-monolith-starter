import { Injectable } from "@nestjs/common";
import { and, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { type Result } from "neverthrow";
import { DatabaseService } from "../../../../infrastructure/database";
import { TenantContextService } from "../../../../infrastructure/database";
import { BaseRepository } from "../../../../infrastructure/database";
import { dsrRequests, type DsrRow } from "../schemas/privacy.schema";
import { DsrRequest } from "../../domain/entities/dsr.entity";

@Injectable()
export class PrivacyRepository extends BaseRepository<DsrRequest, DsrRow> {
  constructor(database: DatabaseService, tenantContext: TenantContextService) {
    super(dsrRequests, database, tenantContext, false);
  }

  protected toDomain(row: DsrRow): DsrRequest {
    return DsrRequest.fromPersistence({
      id: row.id,
      type: row.type as DsrRequest["type"],
      status: row.status as DsrRequest["status"],
      subjectUserId: row.subjectUserId,
      tenantId: row.tenantId,
      payload: (row.payload as unknown) ?? undefined,
      attempts: row.attempts,
      lockedAt: row.lockedAt,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  findByIdAndSubject(id: string, subjectUserId: string): Promise<Result<DsrRequest | null, never>> {
    return this.findOne({ id, subjectUserId });
  }

  findPendingErasureForSubject(subjectUserId: string): Promise<Result<DsrRequest | null, never>> {
    return this.findOne({ subjectUserId, type: "ACCOUNT_ERASURE", status: "REQUESTED" });
  }

  async findActiveExportForSubject(subjectUserId: string): Promise<DsrRequest | null> {
    const rows = await this.getDb()
      .select()
      .from(dsrRequests)
      .where(
        and(
          eq(dsrRequests.subjectUserId, subjectUserId),
          eq(dsrRequests.type, "EXPORT"),
          inArray(dsrRequests.status, ["REQUESTED", "PROCESSING", "READY", "PARTIAL"]),
          or(isNull(dsrRequests.expiresAt), gt(dsrRequests.expiresAt, new Date())),
        ),
      )
      .limit(1);
    return rows[0] ? this.toDomain(rows[0]) : null;
  }

  async claimExportBatch(limit: number): Promise<DsrRequest[]> {
    const result = await this.getDb().execute(sql`WITH candidates AS (
      SELECT id FROM dsr_requests
      WHERE type = 'EXPORT'
        AND (
          status = 'REQUESTED'
          OR (status = 'PROCESSING' AND locked_at < NOW() - INTERVAL '15 minutes')
        )
        AND attempts < 3
        AND expires_at > NOW()
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE dsr_requests
    SET status = 'PROCESSING', attempts = attempts + 1,
        locked_at = NOW(), updated_at = NOW()
    WHERE id IN (SELECT id FROM candidates)
    RETURNING *`);
    return (result.rows as DsrRow[]).map((row) => this.toDomain(row));
  }

  async getExportBacklogStats(): Promise<{
    pending: number;
    failed: number;
    oldestPendingAt: Date | null;
  }> {
    const result = await this.getDb().execute(sql`SELECT
      COUNT(*) FILTER (WHERE status IN ('REQUESTED', 'PROCESSING'))::int AS pending,
      COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
      MIN(created_at) FILTER (WHERE status IN ('REQUESTED', 'PROCESSING')) AS oldest_pending_at
    FROM dsr_requests
    WHERE type = 'EXPORT'`);
    const row = result.rows[0] as
      { pending?: number; failed?: number; oldest_pending_at?: Date | string | null } | undefined;
    const oldest = row?.oldest_pending_at;
    return {
      pending: Number(row?.pending ?? 0),
      failed: Number(row?.failed ?? 0),
      oldestPendingAt: oldest ? new Date(oldest) : null,
    };
  }

  async expireAbandonedExports(): Promise<number> {
    const result = await this.getDb().execute(sql`UPDATE dsr_requests
      SET status = 'EXPIRED', payload = NULL, locked_at = NULL, updated_at = NOW()
      WHERE type = 'EXPORT'
        AND status IN ('REQUESTED', 'PROCESSING')
        AND expires_at <= NOW()
      RETURNING id`);
    return result.rows.length;
  }

  async completeExport(id: string, payload: unknown, truncated: boolean, expiresAt: Date) {
    return this.updateById(id, {
      status: truncated ? "PARTIAL" : "READY",
      payload,
      expiresAt,
      lockedAt: null,
    });
  }

  async markExportAttemptFailed(id: string, terminal: boolean) {
    return this.updateById(id, {
      status: terminal ? "FAILED" : "REQUESTED",
      payload: null,
      lockedAt: null,
    });
  }

  async findExpiredErasureBatch(limit: number): Promise<DsrRequest[]> {
    const db = this.getDb();
    const rows = await (
      db as unknown as {
        select: () => {
          from: (t: unknown) => {
            where: (c: unknown) => { limit: (n: number) => Promise<DsrRow[]> };
          };
        };
      }
    )
      .select()
      .from(dsrRequests)
      .where(
        and(eq(dsrRequests.status, "REQUESTED"), lt(dsrRequests.expiresAt, new Date())) as never,
      )
      .limit(limit);
    return rows.map((r) => this.toDomain(r));
  }

  async findExpiredExportBatch(limit: number): Promise<DsrRequest[]> {
    const db = this.getDb();
    const rows = await (
      db as unknown as {
        select: () => {
          from: (t: unknown) => {
            where: (c: unknown) => { limit: (n: number) => Promise<DsrRow[]> };
          };
        };
      }
    )
      .select()
      .from(dsrRequests)
      .where(
        and(
          inArray(dsrRequests.status, ["READY", "PARTIAL"]),
          lt(dsrRequests.expiresAt, new Date()),
        ) as never,
      )
      .limit(limit);
    return rows.map((r) => this.toDomain(r));
  }
}
