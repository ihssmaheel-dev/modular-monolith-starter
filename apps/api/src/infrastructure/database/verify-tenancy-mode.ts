import { sql } from "drizzle-orm";
import { env } from "../../config/env";
import type { DatabaseService } from "./database.service";
import type { PinoLoggerService } from "../logger/logger.service";

/**
 * Fail fast on tenancy-mode vs data mismatch: booting `single` against a
 * database that already holds organizations means multi-tenant data would be
 * served without tenant isolation. Never silently continue.
 */
export async function verifyTenancyMode(
  database: DatabaseService,
  logger: PinoLoggerService,
): Promise<void> {
  if (env.TENANCY_MODE !== "single") return;
  const count = await database.withSystemScope(async () => {
    // Read through the ambient transaction: getDb() would run outside the
    // system scope established above and can incorrectly count zero.
    const tx = database.getTx();
    if (!tx) throw new Error("TENANCY_MODE_CHECK_REQUIRES_TRANSACTION");
    const rows = (await (
      tx as unknown as {
        execute: (query: unknown) => Promise<{ rows: Array<{ count: string }> }>;
      }
    ).execute(sql`select count(*) as count from organizations`)) as {
      rows: Array<{ count: string }>;
    };
    return Number(rows.rows[0]?.count ?? 0);
  });
  if (count > 0) {
    logger.error(
      { organizationCount: count },
      "Refusing to boot: TENANCY_MODE=single but organizations exist. " +
        "Set TENANCY_MODE=multi or migrate data before starting.",
    );
    throw new Error("TENANCY_MODE_MISMATCH: organizations exist in single-tenant mode");
  }
}
