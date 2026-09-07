import { Injectable } from "@nestjs/common";
import { and, eq, lt } from "drizzle-orm";
import { type Result } from "neverthrow";
import { DatabaseService } from "../../../infrastructure/database";
import { TenantContextService } from "../../../infrastructure/database";
import { BaseRepository } from "../../../infrastructure/database";
import { dsrRequests, type DsrRow } from "./schemas/privacy.schema";
import { DsrRequest } from "../domain/entities/dsr.entity";

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
        and(eq(dsrRequests.status, "READY"), lt(dsrRequests.expiresAt, new Date())) as never,
      )
      .limit(limit);
    return rows.map((r) => this.toDomain(r));
  }
}
