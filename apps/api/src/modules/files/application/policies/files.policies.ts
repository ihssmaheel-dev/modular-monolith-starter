import type { Policy } from "@repo/authorization";

export const filePolicies: Policy[] = [
  {
    id: "file-owner-access",
    description: "Allow file owners to read, confirm, and delete their file",
    resourceType: "file",
    action: ["files:read", "files:upload", "files:delete"],
    effect: "ALLOW",
    condition: ({ principal, resource }) => {
      if (!resource) return false;
      const uploadedBy =
        (resource.data as { uploadedBy?: string } | undefined)?.uploadedBy ??
        (resource.attributes as { uploadedBy?: string } | undefined)?.uploadedBy;
      return (
        (!resource.tenantId || resource.tenantId === principal.tenantId) &&
        (resource.ownerId === principal.id || uploadedBy === principal.id)
      );
    },
  },
  {
    id: "file-avatar-read",
    description: "Allow authenticated users to read and download avatars",
    resourceType: "file",
    action: "files:read",
    effect: "ALLOW",
    condition: ({ resource }) => {
      if (!resource) return false;
      const data = resource.data as { slot?: string | null; parentType?: string } | undefined;
      const attrs = resource.attributes as
        { slot?: string | null; parentType?: string } | undefined;
      return (
        data?.slot === "avatar" ||
        data?.parentType === "user" ||
        attrs?.slot === "avatar" ||
        attrs?.parentType === "user"
      );
    },
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
      const sameTenant = !resource.tenantId || resource.tenantId === principal.tenantId;
      return isNotConfidential && sameTenant;
    },
  },
];
