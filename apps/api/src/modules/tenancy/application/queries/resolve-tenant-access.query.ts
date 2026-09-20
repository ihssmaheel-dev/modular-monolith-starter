import { Injectable, Optional } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";
import type { TenantContext } from "@repo/contracts";
import { env } from "../../../../config/env";
import type { TenancyError } from "../../domain/errors/tenancy.errors";
import { MembershipsRepository } from "../../infrastructure/repositories/memberships.repository";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { RedisService } from "../../../../infrastructure/redis";

const MEMBERSHIP_CACHE_TTL_SECONDS = 120;

@Injectable()
export class ResolveTenantAccessQuery {
  constructor(
    private readonly memberships: MembershipsRepository,
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContextService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  async execute(userId: string, tenantId?: string): Promise<Result<TenantContext, TenancyError>> {
    if (env.TENANCY_MODE === "single") return ok({ mode: "single" });
    if (!tenantId) return err({ type: "TENANT_REQUIRED" });

    const client = this.redis?.getClient();
    const cacheKey = `cache:membership:${tenantId}:${userId}`;

    if (client) {
      try {
        const cached = await client.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as TenantContext;
          return ok(parsed);
        }
      } catch {
        // Fail open to database when Redis lookup errors
      }
    }

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

    if (client) {
      try {
        await client.set(cacheKey, JSON.stringify(context), "EX", MEMBERSHIP_CACHE_TTL_SECONDS);
      } catch {
        // Fail open if Redis caching fails
      }
    }

    return ok(context);
  }
}
