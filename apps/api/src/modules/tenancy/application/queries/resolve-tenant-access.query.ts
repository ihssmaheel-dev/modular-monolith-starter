import { Injectable } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";
import type { TenantContext } from "@repo/contracts";
import { env } from "../../../../config/env";
import type { TenancyError } from "../../domain/errors/tenancy.errors";
import { MembershipsRepository } from "../../infrastructure/repositories/memberships.repository";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";

@Injectable()
export class ResolveTenantAccessQuery {
  constructor(
    private readonly memberships: MembershipsRepository,
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(userId: string, tenantId?: string): Promise<Result<TenantContext, TenancyError>> {
    if (env.TENANCY_MODE === "single") return ok({ mode: "single" });
    if (!tenantId) return err({ type: "TENANT_REQUIRED" });

    // Membership is an authorization boundary. A cache-aside invalidation can
    // race an in-flight read or transaction commit and resurrect a removed
    // membership or elevated role. Always observe committed database state.
    const result = await this.tenantContext.run({ mode: "multi", tenantId }, () =>
      this.database.withResultTransaction(() => this.memberships.findMembership(tenantId, userId)),
    );
    if (result.isErr()) return err({ type: "MEMBERSHIP_NOT_FOUND" });
    const membership = result.value;
    if (!membership) return err({ type: "MEMBERSHIP_NOT_FOUND" });

    const context: TenantContext = {
      mode: "multi",
      tenantId,
      membershipId: membership.data.id,
      role: membership.data.role,
    };

    return ok(context);
  }
}
