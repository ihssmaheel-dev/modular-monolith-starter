import type { Permission, Policy } from "@repo/authorization";

/**
 * Creates an ownership policy for a bounded resource and an explicit action set.
 *
 * Ownership is a relationship, not a permission. A wildcard owner policy would
 * silently grant every future action (including destructive or financial actions)
 * to whoever happens to own a row. Callers must therefore provide the exact
 * actions that ownership is allowed to perform.
 */
export function createOwnershipPolicy(
  resourceType: string,
  actions: Permission[],
  id = `${resourceType}-owner-access`,
): Policy {
  return {
    id,
    description: `Owner access for ${resourceType} is limited to explicitly listed actions`,
    resourceType,
    action: actions,
    effect: "ALLOW",
    condition: ({ principal, resource }) => {
      if (!resource) return false;
      return (
        resource.ownerId === principal.id &&
        (!resource.tenantId || resource.tenantId === principal.tenantId)
      );
    },
  };
}
