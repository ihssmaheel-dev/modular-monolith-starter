import { Injectable } from "@nestjs/common";
import { and, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { ok, type Result } from "neverthrow";
import { DatabaseService } from "../../../../infrastructure/database";
import { TenantContextService } from "../../../../infrastructure/database";
import { BaseRepository } from "../../../../infrastructure/database";
import { dsrRequests, type DsrRow } from "../schemas/privacy.schema";
import { DSR_MAX_ATTEMPTS, DsrRequest } from "../../domain/entities/dsr.entity";

const ERASURE_LOCK_TIMEOUT_MINUTES = 15;
const CLAIM_COLUMNS = sql`id, type, status, subject_user_id AS "subjectUserId",
  tenant_id AS "tenantId", payload, attempts, locked_at AS "lockedAt",
  expires_at AS "expiresAt", created_at AS "createdAt", updated_at AS "updatedAt"`;
type ClaimRow = Omit<DsrRow, "lockedAt" | "expiresAt" | "createdAt" | "updatedAt"> & {
  lockedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

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
    const result = await this.getDb().execute(sql`WITH exhausted AS (
      UPDATE dsr_requests
      SET status = 'FAILED', payload = NULL, locked_at = NULL, updated_at = NOW()
      WHERE type = 'EXPORT'
        AND status = 'PROCESSING'
        AND attempts >= ${DSR_MAX_ATTEMPTS}
        AND locked_at < NOW() - INTERVAL '15 minutes'
      RETURNING id
    ), candidates AS (
      SELECT id FROM dsr_requests
      WHERE type = 'EXPORT'
        AND (
          status = 'REQUESTED'
          OR (status = 'PROCESSING' AND locked_at < NOW() - INTERVAL '15 minutes')
        )
        AND attempts < ${DSR_MAX_ATTEMPTS}
        AND expires_at > NOW()
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE dsr_requests
    SET status = 'PROCESSING', attempts = attempts + 1,
        locked_at = NOW(), updated_at = NOW()
    WHERE id IN (SELECT id FROM candidates)
    RETURNING ${CLAIM_COLUMNS}`);
    return (result.rows as ClaimRow[]).map((row) => this.fromClaimRow(row));
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
      | { pending?: number; failed?: number; oldest_pending_at?: Date | string | null }
      | undefined;
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

  async completeExport(
    id: string,
    attempts: number,
    payload: unknown,
    truncated: boolean,
    expiresAt: Date,
  ) {
    return this.updateClaimed(id, attempts, {
      status: truncated ? "PARTIAL" : "READY",
      payload,
      expiresAt,
      lockedAt: null,
    });
  }

  async markExportAttemptFailed(id: string, attempts: number, terminal: boolean) {
    return this.updateClaimed(id, attempts, {
      status: terminal ? "FAILED" : "REQUESTED",
      payload: null,
      lockedAt: null,
    });
  }

  /** A reclaimed or completed request cannot be overwritten by an older worker. */
  async updateClaimed(
    id: string,
    attempts: number,
    patch: Partial<Pick<DsrRow, "status" | "payload" | "expiresAt" | "lockedAt">>,
  ): Promise<Result<DsrRequest | null, never>> {
    const rows = await this.getDb()
      .update(dsrRequests)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(dsrRequests.id, id),
          eq(dsrRequests.status, "PROCESSING"),
          eq(dsrRequests.attempts, attempts),
          or(ne(dsrRequests.type, "EXPORT"), gt(dsrRequests.expiresAt, new Date())),
        ),
      )
      .returning();
    return ok(rows[0] ? this.toDomain(rows[0]) : null);
  }

  async claimExpiredErasureBatch(limit: number): Promise<DsrRequest[]> {
    const result = await this.getDb().execute(sql`WITH exhausted AS (
      UPDATE dsr_requests
      SET status = 'FAILED', payload = NULL, locked_at = NULL, updated_at = NOW()
      WHERE type IN ('ACCOUNT_ERASURE', 'ORGANIZATION_ERASURE')
        AND status = 'PROCESSING'
        AND attempts >= ${DSR_MAX_ATTEMPTS}
        AND locked_at < NOW() - (${ERASURE_LOCK_TIMEOUT_MINUTES} * INTERVAL '1 minute')
      RETURNING id
    ), candidates AS (
      SELECT id FROM dsr_requests
      WHERE type IN ('ACCOUNT_ERASURE', 'ORGANIZATION_ERASURE')
        AND expires_at IS NOT NULL
        AND expires_at <= NOW()
        AND attempts < ${DSR_MAX_ATTEMPTS}
        AND (
          status = 'REQUESTED'
          OR (
            status = 'PROCESSING'
            AND locked_at < NOW() - (${ERASURE_LOCK_TIMEOUT_MINUTES} * INTERVAL '1 minute')
          )
        )
      ORDER BY expires_at ASC, created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE dsr_requests
    SET status = 'PROCESSING', attempts = attempts + 1,
        locked_at = NOW(), updated_at = NOW()
    WHERE id IN (SELECT id FROM candidates)
    RETURNING ${CLAIM_COLUMNS}`);
    return (result.rows as ClaimRow[]).map((row) => this.fromClaimRow(row));
  }

  private fromClaimRow(row: ClaimRow): DsrRequest {
    // Raw pg execution bypasses Drizzle's column-name and timestamp decoders.
    return this.toDomain({
      ...row,
      lockedAt: row.lockedAt ? new Date(row.lockedAt) : null,
      expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
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
