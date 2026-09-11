import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";
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
    const migrationsFolder = path.resolve(process.cwd(), "../../migrations/pg");
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
