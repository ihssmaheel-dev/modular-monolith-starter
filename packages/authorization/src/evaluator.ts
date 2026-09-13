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
    if (descriptor.ownerId) return descriptor;
    const source = descriptor.attributes ?? descriptor.data ?? descriptor;
    return {
      ...descriptor,
      ownerId: resolveResourceOwnerId(descriptor.type, source as Record<string, unknown>),
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
  if (!policyType || !reqType) return true;
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

  // 1. Tenant isolation check: Tenant-bound principals cannot cross tenant boundaries
  if (resource?.tenantId && principal.tenantId && resource.tenantId !== principal.tenantId) {
    return { allowed: false, reason: "TENANT_MISMATCH", details: "Cross-tenant access forbidden" };
  }

  // 2. Superadmin bypass (global admins or admins within their active tenant)
  if (principal.role === "admin" || principal.role === "*") {
    return { allowed: true, reason: "SUPERADMIN" };
  }

  const matchingPolicies = policies.filter(
    (p) => matchesAction(p.action, action) && matchesResourceType(p.resourceType, resource?.type),
  );

  // 3. Explicit DENY policies evaluation
  for (const policy of matchingPolicies.filter((p) => p.effect === "DENY")) {
    if (policy.condition({ principal, resource, context: request.context })) {
      return { allowed: false, reason: "EXPLICIT_DENY", matchedPolicyId: policy.id };
    }
  }

  // 4. ReBAC Ownership relation
  if (resource?.ownerId && resource.ownerId === principal.id) {
    return { allowed: true, reason: "REBAC_RELATION", details: "resource_owner" };
  }

  // 5. ABAC Declarative ALLOW policies
  for (const policy of matchingPolicies.filter((p) => p.effect === "ALLOW")) {
    if (policy.condition({ principal, resource, context: request.context })) {
      return { allowed: true, reason: "ABAC_POLICY", matchedPolicyId: policy.id };
    }
  }

  // 6. RBAC Role-to-Permission vocabulary
  const userPerms = resolveUserPermissions(principal.role, principal.tenantRole);
  if (hasPermission(userPerms, action)) {
    return { allowed: true, reason: "RBAC_ROLE" };
  }

  // 7. Default closed-world Deny
  return { allowed: false, reason: "DEFAULT_DENY" };
}
