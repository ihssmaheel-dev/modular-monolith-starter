import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS_KEY, type PermissionRequirement } from "../decorators/permissions.decorator";
import { type TenantContext } from "@repo/contracts";
import type { Permission } from "@repo/authorization";
import { AuthorizationService } from "../../infrastructure/authorization";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly authorization?: AuthorizationService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const raw = this.reflector.getAllAndOverride<PermissionRequirement | Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!raw) return true;

    const requirement: PermissionRequirement = Array.isArray(raw)
      ? { permissions: raw, mode: "all" }
      : raw;

    if (!requirement.permissions || requirement.permissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user || !user.role) {
      throw new ForbiddenException();
    }

    if (!this.authorization) throw new ForbiddenException();

    const tenant = request.tenant as TenantContext | undefined;
    const authorization = this.authorization;
    const principal = {
      id: user.sub,
      email: user.email,
      role: user.role,
      tenantId: tenant?.tenantId,
      tenantRole: tenant?.role,
    };
    // Coarse guard check: RBAC + tenant scope from trusted context only.
    // Never trust request-supplied ownership or attributes here: body and
    // query values are attacker-controlled. Full object-level checks must
    // use AuthorizationService.assert() inside commands with the loaded entity.
    const resource = resolveRequestResource(request, tenant?.tenantId);
    const allowed = requirement.permissions
      ? requirement.mode === "any"
        ? requirement.permissions.some((action) =>
            authorization.can(principal, action, resource, "request"),
          )
        : requirement.permissions.every((action) =>
            authorization.can(principal, action, resource, "request"),
          )
      : false;

    if (!allowed) {
      throw new ForbiddenException();
    }

    return true;
  }
}

function resolveRequestResource(
  request: Record<string, unknown>,
  tenantId?: string,
): Record<string, unknown> | undefined {
  const params = (request.params as Record<string, unknown> | undefined) ?? {};
  const id = typeof params.id === "string" ? params.id : undefined;
  if (!id && !tenantId) return undefined;
  return {
    type: "request",
    ...(id ? { id } : {}),
    ...(tenantId ? { tenantId } : {}),
  };
}
