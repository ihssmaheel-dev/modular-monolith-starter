import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import fs from "node:fs";
import { env } from "../../config/env";

const MIGRATION_LOCK_ID = 884729104;

export async function runMigrations(): Promise<void> {
  // Advisory locks need a direct connection: never run migrations through PgBouncer.
  const pool = new Pool({
    connectionString: env.DB_DIRECT_URL ?? env.DATABASE_URL,
    max: 1,
  });

  const client = await pool.connect();
  try {
    process.stdout.write(
      `[Migrator] Acquiring PostgreSQL advisory lock (${MIGRATION_LOCK_ID})...\n`,
    );
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    process.stdout.write("[Migrator] Advisory lock acquired. Applying Drizzle migrations...\n");

    const db = drizzle(client);
    const migrationsFolder = resolveMigrationsFolder();
    process.stdout.write(`[Migrator] Using migrations directory: ${migrationsFolder}\n`);
    await migrate(db, { migrationsFolder });

    process.stdout.write("[Migrator] Migrations applied successfully.\n");
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
      process.stdout.write("[Migrator] Advisory lock released.\n");
    } catch {
      // ignore unlock teardown
    }
    client.release();
    await pool.end();
  }
}

export function resolveMigrationsFolder(): string {
  if (process.env.MIGRATIONS_DIR && fs.existsSync(process.env.MIGRATIONS_DIR)) {
    return path.resolve(process.env.MIGRATIONS_DIR);
  }
  const candidates = [
    path.resolve(process.cwd(), "migrations/pg"),
    path.resolve(process.cwd(), "../../migrations/pg"),
    path.resolve(__dirname, "../../../../../migrations/pg"),
    path.resolve(__dirname, "../../../../migrations/pg"),
    path.resolve(__dirname, "../../migrations/pg"),
    path.resolve("/app/migrations/pg"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.resolve(process.cwd(), "migrations/pg");
}

if (process.argv[1]?.includes("migrate")) {
  runMigrations()
    .then(() => {
      process.stdout.write("[Migrator] Migration process finished.\n");
      process.exit(0);
    })
    .catch((err) => {
      process.stderr.write(`[Migrator] Migration failed: ${String(err)}\n`);
      process.exit(1);
    });
}
