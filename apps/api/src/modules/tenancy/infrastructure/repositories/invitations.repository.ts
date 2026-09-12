import { Injectable } from "@nestjs/common";
import { eq, and, gt, lte, lt, ne, or, inArray } from "drizzle-orm";
import { ok, type Result } from "neverthrow";
import { DatabaseService } from "../../../../infrastructure/database";
import { TenantContextService } from "../../../../infrastructure/database";
import { BaseRepository } from "../../../../infrastructure/database";
import { invitations, type InvitationRow } from "../schemas/tenancy.schema";
import { Invitation } from "../../domain/entities/tenancy.entity";
import type { PaginatedResult, PaginationOptions } from "../../../../infrastructure/database";

@Injectable()
export class InvitationsRepository extends BaseRepository<Invitation, InvitationRow> {
  constructor(database: DatabaseService, tenantContext: TenantContextService) {
    super(invitations, database, tenantContext, false);
  }

  protected toDomain(row: InvitationRow): Invitation {
    return Invitation.fromPersistence({
      id: row.id,
      tenantId: row.tenantId,
      email: row.email,
      role: row.role as "admin" | "member",
      status: row.status as "pending" | "accepted" | "revoked",
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async findPending(tenantId: string, email: string): Promise<Result<Invitation | null, never>> {
    const db = this.getDb();
    const rows = await (
      db as unknown as {
        select: () => { from: (t: unknown) => { where: (c: unknown) => Promise<InvitationRow[]> } };
      }
    )
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.tenantId, tenantId),
          eq(invitations.email, email),
          eq(invitations.status, "pending"),
          gt(invitations.expiresAt, new Date()),
        ),
      );
    return ok(rows[0] ? this.toDomain(rows[0]) : null);
  }

  async revokeExpired(tenantId: string, email: string): Promise<void> {
    const db = this.getDb();
    await (
      db as unknown as {
        update: (t: unknown) => { set: (v: unknown) => { where: (c: unknown) => Promise<void> } };
      }
    )
      .update(invitations)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(
        and(
          eq(invitations.tenantId, tenantId),
          eq(invitations.email, email),
          eq(invitations.status, "pending"),
          lte(invitations.expiresAt, new Date()),
        ),
      );
  }

  async deleteByEmail(email: string): Promise<void> {
    const db = this.getDb();
    await (db as unknown as { delete: (t: unknown) => { where: (c: unknown) => Promise<void> } })
      .delete(invitations)
      .where(eq(invitations.email, email));
  }

  async deleteByTenant(tenantId: string): Promise<void> {
    const db = this.getDb();
    await (db as unknown as { delete: (t: unknown) => { where: (c: unknown) => Promise<void> } })
      .delete(invitations)
      .where(eq(invitations.tenantId, tenantId));
  }

  /**
   * Removes settled invitations past retention: accepted/revoked rows older
   * than the cutoff, plus pending rows that already expired. Live pending
   * invitations are never touched. Chunked by the caller via `limit`.
   */
  async deleteSettledBefore(cutoff: Date, limit: number): Promise<number> {
    const db = this.getDb();
    const stale = await (
      db as unknown as {
        select: (v: unknown) => {
          from: (t: unknown) => {
            where: (c: unknown) => { limit: (n: number) => Promise<Array<{ id: string }>> };
          };
        };
      }
    )
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          lt(invitations.updatedAt, cutoff),
          or(ne(invitations.status, "pending"), lt(invitations.expiresAt, cutoff)),
        ),
      )
      .limit(limit);
    if (stale.length === 0) return 0;
    await (db as unknown as { delete: (t: unknown) => { where: (c: unknown) => Promise<void> } })
      .delete(invitations)
      .where(
        inArray(
          invitations.id,
          stale.map((row) => row.id),
        ),
      );
    return stale.length;
  }

  async findByTokenHash(tokenHash: string): Promise<Result<Invitation | null, never>> {
    const db = this.getDb();
    const rows = await (
      db as unknown as {
        select: () => { from: (t: unknown) => { where: (c: unknown) => Promise<InvitationRow[]> } };
      }
    )
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.tokenHash, tokenHash),
          eq(invitations.status, "pending"),
          gt(invitations.expiresAt, new Date()),
        ),
      );
    return ok(rows[0] ? this.toDomain(rows[0]) : null);
  }

  paginateForTenant(
    tenantId: string,
    options: PaginationOptions,
  ): Promise<Result<PaginatedResult<Invitation>, never>> {
    return this.paginate({ tenantId }, options);
  }

  async markAccepted(id: string, userId: string): Promise<Result<Invitation | null, never>> {
    const db = this.getDb();
    const rows = await (
      db as unknown as {
        update: (t: unknown) => {
          set: (v: unknown) => {
            where: (c: unknown) => { returning: () => Promise<InvitationRow[]> };
          };
        };
      }
    )
      .update(invitations)
      .set({
        status: "accepted",
        acceptedBy: userId,
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(invitations.id, id),
          eq(invitations.status, "pending"),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .returning();
    return ok(rows[0] ? this.toDomain(rows[0]) : null);
  }
}
