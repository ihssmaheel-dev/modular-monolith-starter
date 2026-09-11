import { Injectable, Optional } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";
import { TenantContextService } from "../../../../infrastructure/database";
import type { TenancyError } from "../../domain/errors/tenancy.errors";
import { MembershipsRepository } from "../../infrastructure/memberships.repository";
import { DatabaseService } from "../../../../infrastructure/database";

@Injectable()
export class RemoveMemberCommand {
  constructor(
    private readonly memberships: MembershipsRepository,
    private readonly context: TenantContextService,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(userId: string): Promise<Result<void, TenancyError>> {
    if (!this.database) return this.persist(userId);
    const result = await this.database.withResultTransaction(() => this.persist(userId));
    return result.mapErr((error) =>
      error.type === "TRANSACTION_FAILED" ? { type: "TENANCY_OPERATION_FAILED" } : error,
    );
  }

  private async persist(userId: string): Promise<Result<void, TenancyError>> {
    const tenant = this.context.get();
    if (!tenant.tenantId) return err({ type: "TENANT_REQUIRED" });
    const target = await this.memberships.findMembership(tenant.tenantId, userId);
    if (target.isErr()) return err({ type: "TENANCY_OPERATION_FAILED" });
    if (!target.value) return err({ type: "MEMBERSHIP_NOT_FOUND" });
    if (target.value.data.role === "owner" && tenant.role !== "owner") {
      return err({ type: "TENANT_FORBIDDEN" });
    }
    // Owner removals change the last-owner invariant: serialize them per
    // organization so concurrent removals cannot each observe two owners.
    if (target.value.data.role === "owner" && this.database) {
      return this.database.withAdvisoryLock(`tenancy:owners:${tenant.tenantId}`, () =>
        this.removePersisted(tenant.tenantId!, userId, tenant.role),
      );
    }
    return this.removePersisted(tenant.tenantId!, userId, tenant.role);
  }

  private async removePersisted(
    tenantId: string,
    userId: string,
    actorRole: string | undefined,
  ): Promise<Result<void, TenancyError>> {
    const target = await this.memberships.findMembership(tenantId, userId);
    if (target.isErr()) return err({ type: "TENANCY_OPERATION_FAILED" });
    if (!target.value) return err({ type: "MEMBERSHIP_NOT_FOUND" });
    if (target.value.data.role === "owner") {
      const owners = await this.memberships.countOwners(tenantId);
      if (owners.isErr()) return err({ type: "TENANCY_OPERATION_FAILED" });
      if (owners.value <= 1) return err({ type: "LAST_OWNER" });
    }
    if (actorRole !== "owner" && actorRole !== "admin") {
      return err({ type: "TENANT_FORBIDDEN" });
    }
    const removed = await this.memberships.remove(tenantId, userId);
    if (removed.isErr()) return err({ type: "TENANCY_OPERATION_FAILED" });
    if (!removed.value) return err({ type: "MEMBERSHIP_NOT_FOUND" });
    return ok(undefined);
  }
}
