import { sql } from "drizzle-orm";
import type { ClsService } from "nestjs-cls";
import { env } from "../../../config/env";
import type { DrizzleDb } from "../database.service";

export async function configureTransactionContext(tx: DrizzleDb, cls?: ClsService): Promise<void> {
  const execute = (tx as unknown as { execute?: (query: unknown) => Promise<unknown> }).execute;
  if (typeof execute !== "function") return;
  const runQuery = execute.bind(tx);
  const current = (cls?.isActive() ? cls.get() : {}) as Record<string, unknown>;
  const mode = typeof current.tenantMode === "string" ? current.tenantMode : env.TENANCY_MODE;
  const tenantId = typeof current.tenantId === "string" ? current.tenantId : "";
  const userId = typeof current.userId === "string" ? current.userId : "";
  const userEmail = typeof current.userEmail === "string" ? current.userEmail : "";
  const systemScope = current.systemScope === true ? "true" : "false";
  await runQuery(sql`
    select
      set_config('app.tenancy_mode', ${mode}, true),
      set_config('app.current_tenant', ${tenantId}, true),
      set_config('app.current_user', ${userId}, true),
      set_config('app.current_user_email', ${userEmail}, true),
      set_config('app.system_scope', ${systemScope}, true),
      set_config('statement_timeout', ${String(env.DB_STATEMENT_TIMEOUT_MS)}, true),
      set_config('lock_timeout', ${String(env.DB_LOCK_TIMEOUT_MS)}, true),
      set_config('idle_in_transaction_session_timeout', ${String(env.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS)}, true)
  `);
}

export async function setTransactionConfig(
  tx: DrizzleDb,
  key: string,
  value: string,
): Promise<void> {
  const execute = (tx as unknown as { execute?: (query: unknown) => Promise<unknown> }).execute;
  if (typeof execute !== "function") return;
  await execute.call(tx, sql`select set_config(${key}, ${value}, true)`);
}
