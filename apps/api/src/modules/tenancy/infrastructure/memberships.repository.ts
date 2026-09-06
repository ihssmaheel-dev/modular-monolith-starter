import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { ok, type Result } from "neverthrow";
import { DatabaseService } from "../../../infrastructure/database";
import { TenantContextService } from "../../../infrastructure/database";
import { BaseRepository } from "../../../infrastructure/database";
import { memberships, type MembershipRow } from "./schemas/tenancy.schema";
import { Membership } from "../domain/entities/tenancy.entity";
import type { TenantRole } from "@repo/contracts";
import type { PaginatedResult, PaginationOptions } from "../../../infrastructure/database";

@Injectable()
export class MembershipsRepository extends BaseRepository<Membership, MembershipRow> {
  constructor(database: DatabaseService, tenantContext: TenantContextService) {
    super(memberships, database, tenantContext, false);
  }

  protected toDomain(row: MembershipRow): Membership {
    return Membership.fromPersistence({
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      userEmail: row.userEmail,
      userName: row.userName,
      role: row.role as TenantRole,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  findMembership(tenantId: string, userId: string): Promise<Result<Membership | null, never>> {
    return this.findOne({ tenantId, userId });
  }

  findByEmail(tenantId: string, email: string): Promise<Result<Membership | null, never>> {
    return this.findOne({ tenantId, userEmail: email });
  }

  paginateForUser(
    userId: string,
    options: PaginationOptions,
  ): Promise<Result<PaginatedResult<Membership>, never>> {
    return this.paginate({ userId }, options);
  }

  paginateForTenant(
    tenantId: string,
    options: PaginationOptions,
  ): Promise<Result<PaginatedResult<Membership>, never>> {
    return this.paginate({ tenantId }, options);
  }

  countOwners(tenantId: string): Promise<Result<number, never>> {
    return this.count({ tenantId, role: "owner" });
  }

  hasOwnerMembership(userId: string): Promise<Result<boolean, never>> {
    return this.exists({ userId, role: "owner" } as unknown as Record<string, unknown>);
  }

  updateRole(
    tenantId: string,
    userId: string,
    role: TenantRole,
  ): Promise<Result<Membership | null, { type: "CONFLICT" }>> {
    return this.updateOne({ tenantId, userId }, { role });
  }

  async remove(tenantId: string, userId: string): Promise<Result<boolean, never>> {
    const membership = await this.findMembership(tenantId, userId);
    if (membership.isErr() || !membership.value) return ok(false);
    return this.deleteById(membership.value.data.id);
  }

  async updateUserSnapshot(
    userId: string,
    changes: { email?: string; name?: string },
  ): Promise<void> {
    const update: Record<string, string> = {};
    if (changes.email) update.userEmail = changes.email;
    if (changes.name) update.userName = changes.name;
    if (Object.keys(update).length === 0) return;
    const db = this.getDb();
    await (
      db as unknown as {
        update: (t: unknown) => { set: (v: unknown) => { where: (c: unknown) => Promise<void> } };
      }
    )
      .update(memberships)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(memberships.userId, userId));
  }

  async removeUser(userId: string): Promise<void> {
    const db = this.getDb();
    await (db as unknown as { delete: (t: unknown) => { where: (c: unknown) => Promise<void> } })
      .delete(memberships)
      .where(eq(memberships.userId, userId));
  }

  async deleteByTenant(tenantId: string): Promise<void> {
    const db = this.getDb();
    await (db as unknown as { delete: (t: unknown) => { where: (c: unknown) => Promise<void> } })
      .delete(memberships)
      .where(eq(memberships.tenantId, tenantId));
  }

  private exists(filter: Record<string, unknown>): Promise<Result<boolean, never>> {
    return this.count(filter).then((r) => r.map((c) => c > 0));
  }
}
