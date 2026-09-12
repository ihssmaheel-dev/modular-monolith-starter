import { Inject, Injectable, OnModuleDestroy, Optional } from "@nestjs/common";
import type { EventEmitter2 } from "@nestjs/event-emitter";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { err, ok, type Result } from "neverthrow";
import { ClsService } from "nestjs-cls";
import { PinoLoggerService } from "../logger/logger.service";
import { env } from "../../config/env";
import type { TransactionError } from "./database.types";
import { TransactionScopes } from "./transaction-scopes";

export type Database = NodePgDatabase;
export type DrizzleDb = Database;

/** Machine code for internal control flow — never user-facing, never an i18n key. */
export const TENANT_CONTEXT_REQUIRES_TRANSACTION = "TENANT_CONTEXT_REQUIRES_TRANSACTION";

export { ADVISORY_LOCK_NAMESPACE } from "./transaction-scopes";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;
  private readonly db: DrizzleDb;
  private readonly logger: PinoLoggerService;
  private readonly scopes: TransactionScopes;

  constructor(
    @Inject(PinoLoggerService) logger: PinoLoggerService,
    @Optional() @Inject(ClsService) private readonly cls?: ClsService,
  ) {
    this.logger = logger.child({ module: "DatabaseService" });
    this.scopes = new TransactionScopes(() => this.getTx(), this.logger);
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.DB_MAX_POOL_SIZE,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
      query_timeout: env.DB_STATEMENT_TIMEOUT_MS,
    });
    this.pool.on("error", (error) => {
      this.logger.error({ error: String(error) }, "Postgres pool error");
    });

    if (typeof this.pool.query === "function") {
      const originalQuery = this.pool.query.bind(this.pool);
      // @ts-expect-error wrapping pg pool query for slow query observability
      this.pool.query = async (...args: Parameters<typeof originalQuery>) => {
        const start = performance.now();
        try {
          const result = await originalQuery(...args);
          const durationMs = performance.now() - start;
          if (durationMs > 100) {
            const sqlText =
              typeof args[0] === "string"
                ? args[0]
                : ((args[0] as { text?: string })?.text ?? "SQL");
            this.logger.warn(
              { sql: sqlText.slice(0, 500), durationMs: Math.round(durationMs) },
              "Slow database query detected (>100ms)",
            );
          }
          return result;
        } catch (err) {
          const durationMs = performance.now() - start;
          const sqlText =
            typeof args[0] === "string" ? args[0] : ((args[0] as { text?: string })?.text ?? "SQL");
          this.logger.error(
            { sql: sqlText.slice(0, 500), durationMs: Math.round(durationMs), error: String(err) },
            "Database query failed",
          );
          throw err;
        }
      };
    }

    this.db = drizzle(this.pool);
    this.logger.info({}, "Postgres pool initialized");
  }

  getDb(): DrizzleDb {
    return this.db;
  }

  getPool(): Pool {
    return this.pool;
  }

  isConnected(): boolean {
    return !this.pool.ended;
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<Result<T, TransactionError>> {
    try {
      const result = await this.runTransaction(fn);
      return ok(result);
    } catch (error) {
      this.logger.error({ error: String(error) }, "Transaction failed");
      return err({ type: "TRANSACTION_FAILED" });
    }
  }

  async withResultTransaction<T, E>(
    fn: () => Promise<Result<T, E>>,
  ): Promise<Result<T, E | TransactionError>> {
    if (this.getTx()) {
      return this.scopes.withSavepointResult(fn);
    }

    try {
      const result = await this.openTransaction(async () => {
        const inner = await fn();
        if (inner.isErr()) {
          throw inner.error;
        }
        return inner.value;
      });
      return ok(result as T);
    } catch (error) {
      if (error && typeof error === "object" && "type" in (error as Record<string, unknown>)) {
        const typed = error as E;
        return err(typed);
      }
      this.logger.error({ error: String(error) }, "Transaction failed");
      return err({ type: "TRANSACTION_FAILED" } as TransactionError);
    }
  }

  /** Runs an HTTP or worker operation in one transaction and preserves thrown failures. */
  async runTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.getTx()) {
      return this.scopes.withSavepoint(fn);
    }
    return this.openTransaction(fn);
  }

  /** Changes the tenant scope inside the active transaction for invitation/system workflows. */
  async setTenantContext(tenantId: string): Promise<void> {
    const tx = this.getTx();
    if (!tx) throw new Error(TENANT_CONTEXT_REQUIRES_TRANSACTION);
    await this.setConfig(tx, "app.current_tenant", tenantId);
    this.cls?.set("tenantId", tenantId);
  }

  /**
   * Binds CLS + SQL scope to one tenant for fn: switches app.current_tenant
   * inside an ambient transaction (restored afterwards), otherwise opens a
   * transaction from matching CLS context. CLS-only switches cannot work:
   * PostgreSQL settings are fixed when the transaction opens.
   */
  async withTenantScope<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    if (this.getTx()) {
      const previous =
        this.cls?.isActive() && typeof this.cls.get("tenantId") === "string"
          ? (this.cls.get("tenantId") as string)
          : "";
      await this.setTenantContext(tenantId);
      try {
        return await fn();
      } finally {
        try {
          await this.setTenantContext(previous);
        } catch (error) {
          this.logger.error({ error: String(error) }, "Tenant scope restore failed");
        }
      }
    }
    if (!this.cls) return fn();
    const current = (this.cls.isActive() ? this.cls.get() : {}) as Record<string, unknown>;
    return this.cls.runWith({ ...current, tenantId } as unknown as Record<string, unknown>, () =>
      this.runTransaction(fn),
    );
  }

  /** Elevates one internal operation and opens a transaction when none is active. */
  async withSystemScope<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.cls) return fn();
    const current = (this.cls.isActive() ? this.cls.get() : {}) as Record<string, unknown>;
    const previousSystemScope = current.systemScope === true;
    const tx = this.getTx();
    return this.cls.runWith(
      { ...current, systemScope: true } as unknown as Parameters<typeof this.cls.runWith>[0],
      async () => {
        if (!tx) return this.runTransaction(fn);
        await this.setConfig(tx, "app.system_scope", "true");
        try {
          return await fn();
        } finally {
          await this.setConfig(tx, "app.system_scope", previousSystemScope ? "true" : "false");
        }
      },
    );
  }

  getTx(): DrizzleDb | undefined {
    if (this.cls?.isActive()) {
      return this.cls.get("databaseTx" as never) as DrizzleDb | undefined;
    }
    return undefined;
  }

  async emitAfterCommit(emitter: EventEmitter2, event: string, payload: unknown): Promise<void> {
    const run = async (): Promise<void> => {
      try {
        await emitter.emitAsync(event, payload);
      } catch (error) {
        this.logger.error({ error: String(error), event }, "Post-commit event emission failed");
      }
    };
    if (!this.cls?.isActive() || !this.getTx()) {
      await run();
      return;
    }
    const pending = (this.cls.get("afterCommit") as Array<() => Promise<void>> | undefined) ?? [];
    pending.push(run);
    this.cls.set("afterCommit", pending);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
    this.logger.info({}, "Postgres pool closed");
  }

  /**
   * Opens the outermost transaction. After-commit callbacks drain only after
   * the Drizzle transaction promise resolves (i.e. after COMMIT) — never
   * before. On rollback the queued callbacks are discarded with the array.
   */
  private async openTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.cls) {
      return this.db.transaction(async (tx: DrizzleDb) => {
        await this.configureTransactionContext(tx);
        return fn();
      });
    }
    const current = (this.cls.isActive() ? this.cls.get() : {}) as Record<string, unknown>;
    const afterCommit: Array<() => Promise<void>> = [];
    const result = await this.cls.runWith(
      { ...current, afterCommit } as unknown as Record<string, unknown>,
      async () =>
        this.db.transaction(async (tx: DrizzleDb) => {
          this.cls?.set("databaseTx", tx);
          this.cls?.set("afterCommit", afterCommit);
          await this.configureTransactionContext(tx);
          return fn();
        }),
    );
    await this.scopes.drainAfterCommit(afterCommit);
    return result;
  }

  /** Serializes a critical section per key (see TransactionScopes). Needs a unit of work. */
  async withAdvisoryLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    return this.scopes.withAdvisoryLock(key, fn);
  }

  /** Runs fn in a savepoint of the ambient transaction; a throw rolls back and propagates. */
  async withSavepoint<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.getTx()) return fn();
    return this.scopes.withSavepoint(fn);
  }

  private async configureTransactionContext(tx: DrizzleDb): Promise<void> {
    const execute = (tx as unknown as { execute?: (query: unknown) => Promise<unknown> }).execute;
    if (typeof execute !== "function") return;
    const runQuery = execute.bind(tx);
    const current = (this.cls?.isActive() ? this.cls.get() : {}) as Record<string, unknown>;
    const mode = typeof current.tenantMode === "string" ? current.tenantMode : env.TENANCY_MODE;
    const tenantId = typeof current.tenantId === "string" ? current.tenantId : "";
    const userId = typeof current.userId === "string" ? current.userId : "";
    const userEmail = typeof current.userEmail === "string" ? current.userEmail : "";
    const systemScope = current.systemScope === true ? "true" : "false";
    await runQuery(sql`select set_config('app.tenancy_mode', ${mode}, true)`);
    await runQuery(sql`select set_config('app.current_tenant', ${tenantId}, true)`);
    await runQuery(sql`select set_config('app.current_user', ${userId}, true)`);
    await runQuery(sql`select set_config('app.current_user_email', ${userEmail}, true)`);
    await runQuery(sql`select set_config('app.system_scope', ${systemScope}, true)`);
    await runQuery(
      sql`select set_config('statement_timeout', ${String(env.DB_STATEMENT_TIMEOUT_MS)}, true)`,
    );
    await runQuery(sql`select set_config('lock_timeout', ${String(env.DB_LOCK_TIMEOUT_MS)}, true)`);
    await runQuery(
      sql`select set_config('idle_in_transaction_session_timeout', ${String(env.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS)}, true)`,
    );
  }

  private async setConfig(tx: DrizzleDb, key: string, value: string): Promise<void> {
    const execute = (tx as unknown as { execute?: (query: unknown) => Promise<unknown> }).execute;
    if (typeof execute !== "function") return;
    await execute.call(tx, sql`select set_config(${key}, ${value}, true)`);
  }
}
