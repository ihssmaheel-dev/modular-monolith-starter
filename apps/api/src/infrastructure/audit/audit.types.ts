export interface DatabaseMutationAudit {
  collectionName: string;
  documentId: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  actorId?: string;
  tenantId?: string;
  before: unknown;
  after: unknown;
}

export function isDatabaseMutationAudit(value: unknown): value is DatabaseMutationAudit {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.collectionName === "string" &&
    typeof record.documentId === "string" &&
    (record.action === "CREATE" || record.action === "UPDATE" || record.action === "DELETE")
  );
}
