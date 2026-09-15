import type { AuthenticatedUser } from "@repo/contracts";
import { AuthorizationService } from "../../infrastructure/authorization";
import { TenantContextService } from "../../infrastructure/database";

export function canAccessResource(
  authorization: AuthorizationService | undefined,
  tenantContext: TenantContextService | undefined,
  actor: AuthenticatedUser,
  action: string,
  resourceType: string,
  resource: unknown,
): boolean {
  if (!authorization) {
    return false;
  }
  return authorization.check({
    principal: principalFor(actor, tenantContext),
    action,
    resourceType,
    resource,
  }).allowed;
}

export function canListTenantResources(
  authorization: AuthorizationService | undefined,
  tenantContext: TenantContextService | undefined,
  actor: AuthenticatedUser,
  action: string,
): boolean {
  return authorization?.can(principalFor(actor, tenantContext), action) ?? false;
}

function principalFor(
  actor: AuthenticatedUser,
  tenantContext: TenantContextService | undefined,
): {
  id: string;
  email: string;
  role: string;
  tenantId?: string;
  tenantRole?: string;
} {
  const tenant = tenantContext?.get();
  return {
    id: actor.sub,
    email: actor.email,
    role: actor.role,
    tenantId: tenant?.tenantId,
    tenantRole: tenant?.role,
  };
}
