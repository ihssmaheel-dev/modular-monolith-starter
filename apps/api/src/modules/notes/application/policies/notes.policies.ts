import type { Policy } from "@repo/authorization";

export const notePolicies: Policy[] = [
  {
    id: "note-department-read",
    description: "Allow reading notes if user belongs to the same department",
    resourceType: "note",
    action: "notes:read",
    effect: "ALLOW",
    condition: ({ principal, resource }) => {
      if (!resource) return false;
      const sameDept = resource.attributes?.department === principal.department;
      const sameTenant = !resource.tenantId || resource.tenantId === principal.tenantId;
      return Boolean(sameDept && sameTenant);
    },
  },
];
