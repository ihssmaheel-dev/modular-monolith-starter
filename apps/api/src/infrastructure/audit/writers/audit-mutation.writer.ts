import { randomUUID } from "node:crypto";
import type { DrizzleDb } from "../../database";
import { redactAuditValue } from "../utils/audit-redaction";
import type { DatabaseMutationAudit } from "../audit.types";
import { auditLogs } from "../schemas/audit.schema";

export async function writeAuditMutation(
  database: DrizzleDb,
  mutation: DatabaseMutationAudit,
): Promise<void> {
  await database.insert(auditLogs).values({
    id: randomUUID(),
    collectionName: mutation.collectionName,
    documentId: mutation.documentId,
    action: mutation.action,
    actorId: mutation.actorId,
    tenantId: mutation.tenantId,
    before: redactAuditValue(mutation.before),
    after: redactAuditValue(mutation.after),
  });
}
