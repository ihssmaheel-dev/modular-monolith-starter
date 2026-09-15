import { TenantAdministrativePermissions, type Policy } from "@repo/authorization";

export const genericTenantAdminPolicy: Policy = {
  id: "generic-tenant-admin-manage",
  description: "Tenant administrators have the enumerated tenant capabilities",
  resourceType: "*",
  action: TenantAdministrativePermissions,
  effect: "ALLOW",
  condition: ({ principal, resource }) => {
    if (!resource) return false;
    const isTenantAdmin =
      principal.role === "admin" ||
      principal.tenantRole === "admin" ||
      principal.tenantRole === "owner";
    const isSameTenant = resource.tenantId === principal.tenantId;
    return isTenantAdmin && isSameTenant;
  },
};
