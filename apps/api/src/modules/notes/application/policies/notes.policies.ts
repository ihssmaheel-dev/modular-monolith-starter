import type { Policy } from "@repo/authorization";

export const notePolicies: Policy[] = [
  {
    id: "note-request-role-access",
    description: "Allow project roles to reach note application authorization",
    resourceType: "request",
    action: ["notes:read", "notes:create", "notes:update", "notes:delete"],
    effect: "ALLOW",
    condition: ({ principal }) =>
      principal.role === "admin" ||
      (!principal.tenantId && principal.role === "user") ||
      ["owner", "admin", "member"].includes(principal.tenantRole ?? ""),
  },
  {
    id: "note-owner-access",
    description: "Allow note owners to read, update, and delete their note",
    resourceType: "note",
    action: ["notes:read", "notes:update", "notes:delete"],
    effect: "ALLOW",
    condition: ({ principal, resource }) =>
      Boolean(
        resource && resource.tenantId === principal.tenantId && resource.ownerId === principal.id,
      ),
  },
  {
    id: "note-department-read",
    description: "Allow reading notes if user belongs to the same department",
    resourceType: "note",
    action: "notes:read",
    effect: "ALLOW",
    condition: ({ principal, resource }) => {
      if (!resource) return false;
      const department = resource.attributes?.department;
      const sameDept = typeof department === "string" && department === principal.department;
      const sameTenant = resource.tenantId === principal.tenantId;
      return Boolean(sameDept && sameTenant);
    },
  },
];
