const DEFAULT_OWNERSHIP_FIELDS: Record<string, string> = {
  note: "createdBy",
  file: "uploadedBy",
  user: "id",
};

const customOwnershipFields: Record<string, string> = {};

export function registerOwnershipField(resourceType: string, fieldName: string): void {
  customOwnershipFields[resourceType] = fieldName;
}

export function resolveResourceOwnerId(
  resourceType: string,
  data: Record<string, unknown> | undefined,
): string | undefined {
  if (!data) return undefined;
  const field = customOwnershipFields[resourceType] ?? DEFAULT_OWNERSHIP_FIELDS[resourceType];
  const value = field
    ? data[field]
    : (data.ownerId ??
      data.owner_id ??
      data.createdBy ??
      data.created_by ??
      data.uploadedBy ??
      data.uploaded_by ??
      data.userId ??
      data.user_id);
  return typeof value === "string" ? value : undefined;
}

export function getOwnershipField(resourceType: string): string | undefined {
  return customOwnershipFields[resourceType] ?? DEFAULT_OWNERSHIP_FIELDS[resourceType];
}
