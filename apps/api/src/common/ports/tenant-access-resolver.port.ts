import type { Result } from "neverthrow";
import type { TenantContext } from "@repo/contracts";

export const TENANT_ACCESS_RESOLVER_PORT = Symbol("TENANT_ACCESS_RESOLVER_PORT");

export interface TenantAccessResolverPort {
  resolveAccess(
    userId: string,
    tenantId?: string,
  ): Promise<Result<TenantContext, { type: string }>>;
}
