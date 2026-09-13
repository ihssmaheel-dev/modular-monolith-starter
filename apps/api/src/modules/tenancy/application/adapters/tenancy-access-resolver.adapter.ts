import { Injectable } from "@nestjs/common";
import type { Result } from "neverthrow";
import type { TenantContext } from "@repo/contracts";
import type { TenantAccessResolverPort } from "../../../../common/ports/tenant-access-resolver.port";
import { ResolveTenantAccessQuery } from "../queries/resolve-tenant-access.query";

@Injectable()
export class TenancyAccessResolverAdapter implements TenantAccessResolverPort {
  constructor(private readonly resolver: ResolveTenantAccessQuery) {}

  async resolveAccess(
    userId: string,
    tenantId?: string,
  ): Promise<Result<TenantContext, { type: string }>> {
    return this.resolver.execute(userId, tenantId);
  }
}
