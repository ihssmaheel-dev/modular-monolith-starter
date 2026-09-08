import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { env } from "../../config/env";

const MIGRATIONS_PATH = path.resolve(process.cwd(), "../../migrations/pg");
const DATABASE_PREFIX = "monolith_migration_check";
const SINGLE_MIGRATION_TAG = "0000_initial";
const HARDENED_TABLES = [
  "audit_logs",
  "outbox_events",
  "notes",
  "files",
  "memberships",
  "invitations",
  "organizations",
  "dsr_requests",
  "notifications",
  "notification_preferences",
  "device_tokens",
  "notification_batches",
] as const;
const HARDENING_POLICIES = [
  "audit_system_scope",
  "outbox_system_scope",
  "tenant_isolation_notes",
  "tenant_isolation_files",
  "tenant_isolation_memberships",
  "tenant_isolation_invitations",
  "tenant_isolation_organizations",
  "subject_isolation_dsr_requests",
  "subject_isolation_notifications",
  "subject_isolation_notification_preferences",
  "subject_isolation_device_tokens",
  "subject_isolation_notification_batches",
] as const;

type MigrationEntry = { tag: string };
type MigrationJournal = { entries: MigrationEntry[] };

function databaseUrl(database: string): string {
  const url = new URL(env.DATABASE_URL);
  url.pathname = `/${database}`;
  return url.toString();
}

function assertSafeDatabaseName(database: string): void {
  if (!/^monolith_migration_check_[0-9]+$/.test(database)) {
    throw new Error("Generated migration database name is invalid");
  }
}

async function assertEnumMigrationOwnership(): Promise<void> {
  const enumAlteration =
    /ALTER TYPE\s+"public"\."outbox_status"\s+ADD VALUE(?:\s+IF NOT EXISTS)?\s+'DEAD_LETTER'|CREATE TYPE\s+"public"\."outbox_status"[^;]*'DEAD_LETTER'/gi;
  const journal = JSON.parse(
    await readFile(path.join(MIGRATIONS_PATH, "meta", "_journal.json"), "utf8"),
  ) as MigrationJournal;
  const tags = journal.entries.map((entry) => entry.tag);
  if (tags[0] !== SINGLE_MIGRATION_TAG) {
    throw new Error(`Migration lineage must start with ${SINGLE_MIGRATION_TAG}`);
  }
  // Squashed lineage (post-0000_initial): DEAD_LETTER is defined once in the
  // initial migration and must never be altered by later migrations.
  const initial = await readFile(path.join(MIGRATIONS_PATH, `${SINGLE_MIGRATION_TAG}.sql`), "utf8");
  const definitions =
    initial.match(/CREATE TYPE\s+"public"\."outbox_status"[^;]*'DEAD_LETTER'/gi) ?? [];
  if (definitions.length !== 1) {
    throw new Error(`${SINGLE_MIGRATION_TAG}.sql must define DEAD_LETTER exactly once`);
  }
  for (const tag of tags.slice(1)) {
    const sql = await readFile(path.join(MIGRATIONS_PATH, `${tag}.sql`), "utf8");
    enumAlteration.lastIndex = 0;
    if (enumAlteration.test(sql)) {
      throw new Error(`${tag}.sql must not alter outbox_status`);
    }
  }
}

async function withClient<T>(url: string, operation: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url });
  let connected = false;
  try {
    await client.connect();
    connected = true;
    return await operation(client);
  } finally {
    if (connected) await client.end();
  }
}

async function createDatabase(database: string): Promise<void> {
  assertSafeDatabaseName(database);
  await withClient(databaseUrl("postgres"), (client) =>
    client.query(`CREATE DATABASE "${database}"`).then(() => undefined),
  );
}

async function dropDatabase(database: string): Promise<void> {
  assertSafeDatabaseName(database);
  await withClient(databaseUrl("postgres"), (client) =>
    client.query(`DROP DATABASE IF EXISTS "${database}"`).then(() => undefined),
  );
}

async function cleanupDatabase(database: string): Promise<void> {
  try {
    await dropDatabase(database);
  } catch (error: unknown) {
    process.stderr.write(`[MigrationCheck] Cleanup failed for ${database}: ${String(error)}\n`);
  }
}

async function cleanupMigrationFolder(folder: string): Promise<void> {
  try {
    await rm(folder, { recursive: true, force: true });
  } catch (error: unknown) {
    process.stderr.write(`[MigrationCheck] Cleanup failed for ${folder}: ${String(error)}\n`);
  }
}

async function applyMigrations(database: string, folder: string): Promise<void> {
  await withClient(databaseUrl(database), async (client) => {
    await migrate(drizzle(client), { migrationsFolder: folder });
  });
}

async function createPartialMigrations(appliedCount: number): Promise<string> {
  const folder = await mkdtemp(path.join(os.tmpdir(), "monolith-migrations-"));
  try {
    await cp(MIGRATIONS_PATH, folder, { recursive: true });

    const journalPath = path.join(folder, "meta", "_journal.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as MigrationJournal;
    const appliedEntries = journal.entries.slice(0, appliedCount);
    await writeFile(
      journalPath,
      `${JSON.stringify({ ...journal, entries: appliedEntries }, null, 2)}\n`,
    );

    for (const entry of journal.entries.slice(appliedCount)) {
      await rm(path.join(folder, `${entry.tag}.sql`), { force: true });
    }
    return folder;
  } catch (error: unknown) {
    await cleanupMigrationFolder(folder);
    throw error;
  }
}

async function assertEnumState(client: Client): Promise<void> {
  const result = await client.query<{ enumlabel: string }>(
    `SELECT e.enumlabel
     FROM pg_enum e
     JOIN pg_type t ON t.oid = e.enumtypid
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typname = 'outbox_status'
     ORDER BY e.enumsortorder`,
  );
  const deadLetterCount = result.rows.filter((row) => row.enumlabel === "DEAD_LETTER").length;
  if (deadLetterCount !== 1) throw new Error("DEAD_LETTER enum value must exist exactly once");
}

async function assertMigrationHistory(client: Client, expectedCount: number): Promise<void> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM "drizzle"."__drizzle_migrations"`,
  );
  if (Number(result.rows[0]?.count) !== expectedCount) {
    throw new Error(`Expected ${expectedCount} applied migrations`);
  }
}

async function assertRlsState(client: Client): Promise<void> {
  const result = await client.query<{
    relname: string;
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
  }>(
    `SELECT relname, relrowsecurity, relforcerowsecurity
     FROM pg_class
     WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1::text[])`,
    [HARDENED_TABLES],
  );
  const tableState = new Map(result.rows.map((row) => [row.relname, row]));
  for (const table of HARDENED_TABLES) {
    const state = tableState.get(table);
    if (!state?.relrowsecurity || !state.relforcerowsecurity) {
      throw new Error(`${table} must have forced RLS after production hardening`);
    }
  }
}

async function assertHardeningObjects(client: Client): Promise<void> {
  const policyResult = await client.query<{ policyname: string }>(
    `SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND policyname = ANY($1::text[])`,
    [HARDENING_POLICIES],
  );
  if (policyResult.rowCount !== HARDENING_POLICIES.length) {
    throw new Error("Production hardening policies are incomplete");
  }

  const functionResult = await client.query<{ procedure: string | null }>(
    `SELECT to_regprocedure('public.purge_audit_logs_older_than(integer)') AS procedure`,
  );
  if (!functionResult.rows[0]?.procedure) {
    throw new Error("Audit retention function is missing after production hardening");
  }

  const auditId = `migration-check-audit-${Date.now()}`;
  await client.query("SELECT set_config('app.system_scope', 'true', false)");
  await client.query(
    `INSERT INTO public.audit_logs
      (id, collection_name, document_id, action, created_at)
     VALUES ($1, 'migration_check', $2, 'CREATE', NOW() - INTERVAL '31 days')`,
    [auditId, auditId],
  );
  await client.query("SELECT set_config('app.system_scope', 'false', false)");
  let directDeleteRejected = false;
  try {
    await client.query("DELETE FROM public.audit_logs WHERE id = $1", [auditId]);
  } catch {
    directDeleteRejected = true;
  }
  if (!directDeleteRejected) throw new Error("Audit logs must reject direct deletes");
  const purgeResult = await client.query<{ purged: number }>(
    "SELECT public.purge_audit_logs_older_than($1)::int AS purged",
    [30],
  );
  if (Number(purgeResult.rows[0]?.purged ?? 0) < 1) {
    throw new Error("Audit retention function did not purge an expired audit record");
  }
}

async function assertMigrationState(database: string, expectedCount: number): Promise<void> {
  await withClient(databaseUrl(database), async (client) => {
    await assertEnumState(client);
    await assertMigrationHistory(client, expectedCount);
    await assertRlsState(client);
    await assertHardeningObjects(client);
  });
}

async function verifyMigrations(): Promise<void> {
  const suffix = `${Date.now()}${process.pid}`;
  const freshDatabase = `${DATABASE_PREFIX}_${suffix}`;
  const upgradeDatabase = `${DATABASE_PREFIX}_${suffix + 1}`;
  let partialMigrations: string | undefined;
  const journal = JSON.parse(
    await readFile(path.join(MIGRATIONS_PATH, "meta", "_journal.json"), "utf8"),
  ) as MigrationJournal;
  const partialMigrationCount = Math.max(journal.entries.length - 1, 0);

  try {
    await assertEnumMigrationOwnership();
    await createDatabase(freshDatabase);
    await applyMigrations(freshDatabase, MIGRATIONS_PATH);
    await assertMigrationState(freshDatabase, journal.entries.length);

    await createDatabase(upgradeDatabase);
    partialMigrations = await createPartialMigrations(partialMigrationCount);
    await applyMigrations(upgradeDatabase, partialMigrations);
    await applyMigrations(upgradeDatabase, MIGRATIONS_PATH);
    await assertMigrationState(upgradeDatabase, journal.entries.length);

    process.stdout.write("[MigrationCheck] Fresh and upgrade migration paths passed.\n");
  } finally {
    if (partialMigrations) await cleanupMigrationFolder(partialMigrations);
    await Promise.all([cleanupDatabase(freshDatabase), cleanupDatabase(upgradeDatabase)]);
  }
}

verifyMigrations().catch((error: unknown) => {
  process.stderr.write(`[MigrationCheck] Failed: ${String(error)}\n`);
  process.stderr.write(
    "[MigrationCheck] Ensure DATABASE_URL points to a reachable PostgreSQL server with temporary database permissions.\n",
  );
  process.exitCode = 1;
});
