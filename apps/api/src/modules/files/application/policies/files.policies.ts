import type { Policy } from "@repo/authorization";

export const filePolicies: Policy[] = [
  {
    id: "file-public-download",
    description: "Allow downloading non-confidential files within the same tenant",
    resourceType: "file",
    action: "files:read",
    effect: "ALLOW",
    condition: ({ principal, resource }) => {
      if (!resource) return false;
      const isNotConfidential = resource.attributes?.isConfidential !== true;
      const sameTenant = !resource.tenantId || resource.tenantId === principal.tenantId;
      return isNotConfidential && sameTenant;
    },
  },
];
