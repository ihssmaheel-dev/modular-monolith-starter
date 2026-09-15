import type { Policy } from "@repo/authorization";

export const filePolicies: Policy[] = [
  {
    id: "file-owner-access",
    description: "Allow file owners to read, confirm, and delete their file",
    resourceType: "file",
    action: ["files:read", "files:upload", "files:delete"],
    effect: "ALLOW",
    condition: ({ principal, resource }) =>
      Boolean(
        resource && resource.tenantId === principal.tenantId && resource.ownerId === principal.id,
      ),
  },
  {
    id: "file-public-download",
    description: "Allow downloading non-confidential files within the same tenant",
    resourceType: "file",
    action: "files:read",
    effect: "ALLOW",
    condition: ({ principal, resource }) => {
      if (!resource) return false;
      const isNotConfidential = resource.attributes?.isConfidential !== true;
      const sameTenant = resource.tenantId === principal.tenantId;
      return isNotConfidential && sameTenant;
    },
  },
];
