import { Injectable, Optional } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { ok, type Result } from "neverthrow";
import { DatabaseService } from "../../../../infrastructure/database";
import { TenantContextService } from "../../../../infrastructure/database";
import { BaseRepository } from "../../../../infrastructure/database";
import { memberships, type MembershipRow } from "../schemas/tenancy.schema";
import { Membership } from "../../domain/entities/tenancy.entity";
import type { TenantRole } from "@repo/contracts";
import type { PaginatedResult, PaginationOptions } from "../../../../infrastructure/database";
import { RedisService } from "../../../../infrastructure/redis";

@Injectable()
export class MembershipsRepository extends BaseRepository<Membership, MembershipRow> {
  constructor(
    database: DatabaseService,
    tenantContext: TenantContextService,
    @Optional() private readonly redis?: RedisService,
  ) {
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

  async invalidateCache(tenantId: string, userId: string): Promise<void> {
    const client = this.redis?.getClient();
    if (!client) return;
    try {
      await client.del(`cache:membership:${tenantId}:${userId}`);
    } catch {
      // Fail open
    }
  }

  override async create(
    data: Record<string, unknown>,
  ): Promise<Result<Membership, { type: "TENANT_REQUIRED" }>> {
    const result = await super.create(data);
    if (
      result.isOk() &&
      typeof data["tenantId"] === "string" &&
      typeof data["userId"] === "string"
    ) {
      await this.invalidateCache(data["tenantId"], data["userId"]);
    }
    return result;
  }

  async updateRole(
    tenantId: string,
    userId: string,
    role: TenantRole,
  ): Promise<Result<Membership | null, { type: "CONFLICT" }>> {
    const result = await this.updateOne({ tenantId, userId }, { role });
    if (result.isOk() && result.value) {
      await this.invalidateCache(tenantId, userId);
    }
    return result;
  }

  async remove(tenantId: string, userId: string): Promise<Result<boolean, never>> {
    const membership = await this.findMembership(tenantId, userId);
    if (membership.isErr() || !membership.value) return ok(false);
    const result = await this.deleteById(membership.value.data.id);
    if (result.isOk() && result.value) {
      await this.invalidateCache(tenantId, userId);
    }
    return result;
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
    const userMemberships = await this.paginateForUser(userId, { limit: 100 });
    const db = this.getDb();
    await (db as unknown as { delete: (t: unknown) => { where: (c: unknown) => Promise<void> } })
      .delete(memberships)
      .where(eq(memberships.userId, userId));
    if (userMemberships.isOk()) {
      await Promise.all(
        userMemberships.value.items.map((m) => this.invalidateCache(m.data.tenantId, userId)),
      );
    }
  }

  async deleteByTenant(tenantId: string): Promise<void> {
    const tenantMemberships = await this.paginateForTenant(tenantId, { limit: 100 });
    const db = this.getDb();
    await (db as unknown as { delete: (t: unknown) => { where: (c: unknown) => Promise<void> } })
      .delete(memberships)
      .where(eq(memberships.tenantId, tenantId));
    if (tenantMemberships.isOk()) {
      await Promise.all(
        tenantMemberships.value.items.map((m) => this.invalidateCache(tenantId, m.data.userId)),
      );
    }
  }

  private exists(filter: Record<string, unknown>): Promise<Result<boolean, never>> {
    return this.count(filter).then((r) => r.map((c) => c > 0));
  }
}
