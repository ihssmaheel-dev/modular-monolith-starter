import { Injectable, Optional } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";
import type { TenantRole } from "@repo/contracts";
import { TenantContextService } from "../../../../infrastructure/database";
import type { Membership } from "../../domain/entities/tenancy.entity";
import type { TenancyError } from "../../domain/errors/tenancy.errors";
import { MembershipsRepository } from "../../infrastructure/repositories/memberships.repository";
import { DatabaseService } from "../../../../infrastructure/database";

@Injectable()
export class UpdateMemberCommand {
  constructor(
    private readonly memberships: MembershipsRepository,
    private readonly context: TenantContextService,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(userId: string, role: TenantRole): Promise<Result<Membership, TenancyError>> {
    if (!this.database) return this.persist(userId, role);
    const result = await this.database.withResultTransaction(() => this.persist(userId, role));
    return result.mapErr((error) =>
      error.type === "TRANSACTION_FAILED" ? { type: "TENANCY_OPERATION_FAILED" } : error,
    );
  }

  private async persist(
    userId: string,
    role: TenantRole,
  ): Promise<Result<Membership, TenancyError>> {
    const tenant = this.context.get();
    if (!tenant.tenantId) return err({ type: "TENANT_REQUIRED" });
    // Promotions, demotions, and removals share one organization lock. A
    // pre-lock role read cannot safely decide whether serialization is needed.
    if (this.database) {
      return this.database.withAdvisoryLock(`tenancy:owners:${tenant.tenantId}`, () =>
        this.updatePersisted(tenant.tenantId!, userId, role, tenant.role),
      );
    }
    return this.updatePersisted(tenant.tenantId!, userId, role, tenant.role);
  }

  private async updatePersisted(
    tenantId: string,
    userId: string,
    role: TenantRole,
    actorRole: TenantRole | undefined,
  ): Promise<Result<Membership, TenancyError>> {
    const target = await this.memberships.findMembership(tenantId, userId);
    if (target.isErr()) return err({ type: "TENANCY_OPERATION_FAILED" });
    if (!target.value) return err({ type: "MEMBERSHIP_NOT_FOUND" });
    if (!canChangeRole(actorRole, target.value.data.role, role)) {
      return err({ type: "TENANT_FORBIDDEN" });
    }
    if (target.value.data.role === "owner" && role !== "owner") {
      const owners = await this.memberships.countOwners(tenantId);
      if (owners.isErr()) return err({ type: "TENANCY_OPERATION_FAILED" });
      if (owners.value <= 1) return err({ type: "LAST_OWNER" });
    }
    const updated = await this.memberships.updateRole(tenantId, userId, role);
    if (updated.isErr() || !updated.value) return err({ type: "MEMBERSHIP_NOT_FOUND" });
    return ok(updated.value);
  }
}

function canChangeRole(
  actorRole: TenantRole | undefined,
  currentRole: TenantRole,
  nextRole: TenantRole,
): boolean {
  if (actorRole === "owner") return true;
  if (actorRole !== "admin") return false;
  return currentRole !== "owner" && nextRole !== "owner";
}
