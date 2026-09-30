import { randomUUID } from "node:crypto";
import { eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { organizations } from "../apps/api/src/modules/tenancy/infrastructure/schemas/organizations.schema";
import { memberships } from "../apps/api/src/modules/tenancy/infrastructure/schemas/memberships.schema";
import { users } from "../apps/api/src/modules/users/infrastructure/schemas/user.schema";
import { notes } from "../apps/api/src/modules/notes/infrastructure/schemas/note.schema";
import { files } from "../apps/api/src/modules/files/infrastructure/schemas/file.schema";
import { auditLogs } from "../apps/api/src/infrastructure/audit/schemas/audit.schema";
import { outboxEvents } from "../apps/api/src/infrastructure/outbox/schemas/outbox.schema";

export interface MigrationOptions {
  organizationName?: string;
  organizationSlug?: string;
  dryRun?: boolean;
}

export interface MigrationResult {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  membershipsCreated: number;
  notesBackfilled: number;
  filesBackfilled: number;
  auditLogsBackfilled: number;
  outboxEventsBackfilled: number;
  isDryRun: boolean;
}

type DbInstance = NodePgDatabase<Record<string, unknown>>;

class DryRunRollbackError extends Error {
  constructor(public readonly result: MigrationResult) {
    super("MIGRATION_DRY_RUN_ROLLBACK");
  }
}

async function resolveOrganization(
  tx: DbInstance,
  name: string,
  slug: string,
): Promise<{ id: string; name: string; slug: string }> {
  const existing = await tx
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (existing.length > 0 && existing[0]) {
    return { id: existing[0].id, name: existing[0].name, slug: existing[0].slug };
  }

  const allUsers = await tx.select().from(users).where(isNull(users.deletedAt)).limit(1);
  const creatorId = allUsers[0]?.id ?? "00000000-0000-0000-0000-000000000000";
  const orgId = randomUUID();

  await tx.insert(organizations).values({
    id: orgId,
    name,
    slug,
    createdBy: creatorId,
  });

  return { id: orgId, name, slug };
}

async function backfillMemberships(tx: DbInstance, orgId: string): Promise<number> {
  const allUsers = await tx.select().from(users).where(isNull(users.deletedAt));
  let count = 0;

  for (const user of allUsers) {
    const existing = await tx.select().from(memberships).where(eq(memberships.userId, user.id));

    const isMemberOfOrg = existing.some((m) => m.tenantId === orgId);
    if (!isMemberOfOrg) {
      const role = user.role === "admin" ? ("owner" as const) : ("member" as const);
      await tx
        .insert(memberships)
        .values({
          id: randomUUID(),
          tenantId: orgId,
          userId: user.id,
          userEmail: user.email,
          userName: user.name,
          role,
        })
        .onConflictDoNothing({ target: [memberships.tenantId, memberships.userId] });
      count++;
    }
  }

  return count;
}

async function backfillRecords(tx: DbInstance, orgId: string) {
  const [noteRows, fileRows, auditRows, outboxRows] = await Promise.all([
    tx
      .update(notes)
      .set({ tenantId: orgId, updatedAt: new Date() })
      .where(isNull(notes.tenantId))
      .returning({ id: notes.id }),
    tx
      .update(files)
      .set({ tenantId: orgId, updatedAt: new Date() })
      .where(isNull(files.tenantId))
      .returning({ id: files.id }),
    tx
      .update(auditLogs)
      .set({ tenantId: orgId })
      .where(isNull(auditLogs.tenantId))
      .returning({ id: auditLogs.id }),
    tx
      .update(outboxEvents)
      .set({ tenantId: orgId, updatedAt: new Date() })
      .where(isNull(outboxEvents.tenantId))
      .returning({ id: outboxEvents.id }),
  ]);

  return {
    notesBackfilled: noteRows.length,
    filesBackfilled: fileRows.length,
    auditLogsBackfilled: auditRows.length,
    outboxEventsBackfilled: outboxRows.length,
  };
}

export async function migrateToMultiTenant(
  db: DbInstance,
  options: MigrationOptions = {},
): Promise<MigrationResult> {
  const orgName = options.organizationName ?? "Default Organization";
  const orgSlug = options.organizationSlug ?? "default";
  const isDryRun = Boolean(options.dryRun);

  try {
    return await db.transaction(async (tx) => {
      const org = await resolveOrganization(tx, orgName, orgSlug);
      const membershipsCreated = await backfillMemberships(tx, org.id);
      const records = await backfillRecords(tx, org.id);

      const result: MigrationResult = {
        organizationId: org.id,
        organizationName: org.name,
        organizationSlug: org.slug,
        membershipsCreated,
        ...records,
        isDryRun: false,
      };

      if (isDryRun) {
        throw new DryRunRollbackError({ ...result, isDryRun: true });
      }

      return result;
    });
  } catch (error) {
    if (error instanceof DryRunRollbackError) {
      return error.result;
    }
    throw error;
  }
}
