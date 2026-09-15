import { Injectable, Optional } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";
import { TenantContextService } from "../../../../infrastructure/database";
import type { TenancyError } from "../../domain/errors/tenancy.errors";
import { MembershipsRepository } from "../../infrastructure/repositories/memberships.repository";
import { DatabaseService } from "../../../../infrastructure/database";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { TenantMemberRemovedEvent } from "../../domain/events/tenancy.events";

@Injectable()
export class RemoveMemberCommand {
  constructor(
    private readonly memberships: MembershipsRepository,
    private readonly context: TenantContextService,
    @Optional() private readonly database?: DatabaseService,
    @Optional() private readonly events?: EventEmitter2,
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
    // Every membership-role mutation takes the same organization lock. The
    // decision to lock cannot depend on a stale pre-lock role read.
    if (this.database) {
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
    if (target.value.data.role === "owner" && actorRole !== "owner") {
      return err({ type: "TENANT_FORBIDDEN" });
    }
    if (actorRole !== "owner" && actorRole !== "admin") {
      return err({ type: "TENANT_FORBIDDEN" });
    }
    if (target.value.data.role === "owner") {
      const owners = await this.memberships.countOwners(tenantId);
      if (owners.isErr()) return err({ type: "TENANCY_OPERATION_FAILED" });
      if (owners.value <= 1) return err({ type: "LAST_OWNER" });
    }
    const removed = await this.memberships.remove(tenantId, userId);
    if (removed.isErr()) return err({ type: "TENANCY_OPERATION_FAILED" });
    if (!removed.value) return err({ type: "MEMBERSHIP_NOT_FOUND" });
    if (this.events && this.database) {
      await this.database.emitAfterCommit(
        this.events,
        "tenant.member.removed",
        new TenantMemberRemovedEvent(tenantId, userId),
      );
    } else if (this.events) {
      await this.events.emitAsync(
        "tenant.member.removed",
        new TenantMemberRemovedEvent(tenantId, userId),
      );
    }
    return ok(undefined);
  }
}
