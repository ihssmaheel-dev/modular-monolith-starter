import { hasPermission, resolveUserPermissions } from "./permissions";
import type {
  AuthorizationDecision,
  AuthorizationRequest,
  Policy,
  ResourceDescriptor,
} from "./types";
import { resolveResourceOwnerId } from "./ownership";

export function normalizeResource<T>(
  resource?: ResourceDescriptor<T> | T,
  fallbackType = "resource",
): ResourceDescriptor<T> | undefined {
  if (!resource) return undefined;
  if (typeof resource === "object" && "type" in (resource as Record<string, unknown>)) {
    const descriptor = resource as ResourceDescriptor<T>;
    const source = descriptor.attributes ?? descriptor.data ?? descriptor;
    return {
      ...descriptor,
      ownerId:
        descriptor.ownerId ??
        resolveResourceOwnerId(descriptor.type, source as Record<string, unknown>),
      attributes: descriptor.attributes ?? (source as Record<string, unknown>),
    };
  }
  const obj = resource as Record<string, unknown>;
  return {
    type: typeof obj.type === "string" ? obj.type : fallbackType,
    id: typeof obj.id === "string" ? obj.id : undefined,
    tenantId: typeof obj.tenantId === "string" ? obj.tenantId : undefined,
    ownerId: resolveResourceOwnerId(typeof obj.type === "string" ? obj.type : fallbackType, obj),
    attributes: obj,
    data: resource as T,
  };
}

function matchesAction(policyAction: Policy["action"], requestAction: string): boolean {
  const actions = Array.isArray(policyAction) ? policyAction : [policyAction];
  return hasPermission(actions, requestAction);
}

function matchesResourceType(policyType?: string | string[], reqType?: string): boolean {
  if (!policyType) return true;
  if (!reqType) return false;
  const types = Array.isArray(policyType) ? policyType : [policyType];
  return types.includes("*") || types.includes(reqType);
}

export function evaluateAuthorization<
  TResource = unknown,
  TContext extends Record<string, unknown> = Record<string, unknown>,
>(
  request: AuthorizationRequest<TResource, TContext>,
  policies: Policy<TResource, TContext>[] = [],
): AuthorizationDecision {
  const { principal, action } = request;
  const resource = normalizeResource(request.resource, request.resourceType);

  const matchingPolicies = policies.filter(
    (p) => matchesAction(p.action, action) && matchesResourceType(p.resourceType, resource?.type),
  );

  // Explicit denials apply even to deliberately designated super administrators.
  for (const policy of matchingPolicies.filter((p) => p.effect === "DENY")) {
    if (policy.condition({ principal, resource, context: request.context })) {
      return { allowed: false, reason: "EXPLICIT_DENY", matchedPolicyId: policy.id };
    }
  }

  if (principal.role === "*" || principal.attributes?.superAdmin === true) {
    return { allowed: true, reason: "SUPERADMIN" };
  }

  // A tenant-owned resource always requires an active matching tenant.
  if (resource?.tenantId && resource.tenantId !== principal.tenantId) {
    return { allowed: false, reason: "TENANT_MISMATCH", details: "Cross-tenant access forbidden" };
  }
  if (principal.tenantId && resource && !resource.tenantId && resource.type !== "request") {
    return { allowed: false, reason: "TENANT_MISMATCH", details: "Missing tenant scope" };
  }

  // Ownership and other relationships are action-specific ALLOW policies.
  for (const policy of matchingPolicies.filter((p) => p.effect === "ALLOW")) {
    if (policy.condition({ principal, resource, context: request.context })) {
      const relation = resource?.ownerId === principal.id ? "REBAC_RELATION" : "ABAC_POLICY";
      return { allowed: true, reason: relation, matchedPolicyId: policy.id };
    }
  }

  if (!resource || resource.type === "request") {
    const userPerms = resolveUserPermissions(
      principal.role,
      principal.tenantRole,
      [],
      principal.tenantId ? "tenant" : "global",
    );
    if (hasPermission(userPerms, action)) {
      return { allowed: true, reason: "RBAC_ROLE" };
    }
  }

  return { allowed: false, reason: "DEFAULT_DENY" };
}
