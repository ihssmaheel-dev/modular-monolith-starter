import { Inject, Injectable, OnApplicationShutdown, Optional } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type { EventEmitter2 } from "@nestjs/event-emitter";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { err, ok, type Result } from "neverthrow";
import { ClsService } from "nestjs-cls";
import { PinoLoggerService } from "../logger/logger.service";
import type { TransactionError } from "./transactions/transaction.types";
import { TransactionScopes, ADVISORY_LOCK_NAMESPACE } from "./transactions/transaction-scopes";
import { writeAuditMutation } from "../audit/writers/audit-mutation.writer";
import { isDatabaseMutationAudit, type DatabaseMutationAudit } from "../audit/audit.types";
import { createDatabasePool } from "./connection/database-pool";
import { databaseErrorMetadata } from "./connection/database-error.utils";
import { MetricsService } from "../metrics/metrics.service";
import { RedisLockService } from "../redis/redis-lock.service";
import {
  configureTransactionContext,
  setTransactionConfig,
} from "./transactions/transaction-context";

export type Database = NodePgDatabase;
export type DrizzleDb = Database;

/** Machine code for internal control flow — never user-facing, never an i18n key. */
export const TENANT_CONTEXT_REQUIRES_TRANSACTION = "TENANT_CONTEXT_REQUIRES_TRANSACTION";
export const AUDIT_TRANSACTION_REQUIRED = "AUDIT_TRANSACTION_REQUIRED";

const DATABASE_POOL_METRICS_INTERVAL_MS = 15_000;

export { ADVISORY_LOCK_NAMESPACE } from "./transactions/transaction-scopes";

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool: Pool;
  private readonly db: DrizzleDb;
  private readonly logger: PinoLoggerService;
  private readonly scopes: TransactionScopes;

  constructor(
    @Inject(PinoLoggerService) logger: PinoLoggerService,
    @Optional() @Inject(ClsService) private readonly cls?: ClsService,
    @Optional() private readonly metrics?: MetricsService,
    @Optional() @Inject(RedisLockService) private readonly redisLock?: RedisLockService,
  ) {
    this.logger = logger.child({ module: "DatabaseService" });
    this.scopes = new TransactionScopes(
      () => this.getTx(),
      this.logger,
      () => this.getAfterCommitCallbacks(),
    );
    this.pool = createDatabasePool(this.logger);
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

  @Interval(DATABASE_POOL_METRICS_INTERVAL_MS)
  measurePoolHealth(): void {
    this.metrics?.setGauge(
      "postgres_pool_total_connections",
      "PostgreSQL client pool total connections",
      this.pool.totalCount,
    );
    this.metrics?.setGauge(
      "postgres_pool_idle_connections",
      "PostgreSQL client pool idle connections",
      this.pool.idleCount,
    );
    this.metrics?.setGauge(
      "postgres_pool_waiting_clients",
      "PostgreSQL client pool waiting clients",
      this.pool.waitingCount,
    );
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<Result<T, TransactionError>> {
    try {
      const result = await this.runTransaction(fn);
      return ok(result);
    } catch (error) {
      this.logger.error(databaseErrorMetadata(error), "Transaction failed");
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
      this.logger.error(databaseErrorMetadata(error), "Transaction failed");
      return err({ type: "TRANSACTION_FAILED" } as TransactionError);
    }
  }

  async runTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.getTx()) {
      return this.scopes.withSavepoint(fn);
    }
    return this.openTransaction(fn);
  }

  async setTenantContext(tenantId: string): Promise<void> {
    const tx = this.getTx();
    if (!tx) throw new Error(TENANT_CONTEXT_REQUIRES_TRANSACTION);
    await setTransactionConfig(tx, "app.current_tenant", tenantId);
    this.cls?.set("tenantId", tenantId);
  }

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
        await this.setTenantContext(previous);
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
        await setTransactionConfig(tx, "app.system_scope", "true");
        try {
          return await fn();
        } finally {
          await setTransactionConfig(
            tx,
            "app.system_scope",
            previousSystemScope ? "true" : "false",
          );
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

  private getAfterCommitCallbacks(): Array<() => Promise<void>> | undefined {
    if (!this.cls?.isActive()) return undefined;
    return this.cls.get("afterCommit") as Array<() => Promise<void>> | undefined;
  }

  async emitAfterCommit(emitter: EventEmitter2, event: string, payload: unknown): Promise<void> {
    if (event === "database.mutated" && isDatabaseMutationAudit(payload)) {
      await this.recordAuditMutation(payload);
      return;
    }
    await this.runAfterCommit(
      () => emitter.emitAsync(event, payload).then(() => undefined),
      `event:${event}`,
    );
  }

  /** Persists an immutable audit row inside the active business transaction. */
  async recordAuditMutation(mutation: DatabaseMutationAudit): Promise<void> {
    const transaction = this.getTx();
    if (!transaction) throw new Error(AUDIT_TRANSACTION_REQUIRED);
    const write = () => writeAuditMutation(transaction, mutation);
    if (mutation.tenantId) await write();
    else await this.withSystemScope(write);
  }

  /** Defers non-transactional side effects until the surrounding commit succeeds. */
  async runAfterCommit(callback: () => Promise<void>, operation: string): Promise<void> {
    const run = async (): Promise<void> => {
      try {
        await callback();
      } catch (error) {
        this.logger.error({ error: String(error), operation }, "Post-commit operation failed");
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

  async onApplicationShutdown(): Promise<void> {
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
        await configureTransactionContext(tx, this.cls);
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
          await configureTransactionContext(tx, this.cls);
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

  /** Attempts non-blocking acquisition of transaction-scoped advisory lock. Needs active unit of work. */
  async tryAdvisoryLock<T>(
    key: string,
    fn: () => Promise<T>,
  ): Promise<{ acquired: boolean; result?: T }> {
    return this.scopes.tryAdvisoryLock(key, fn);
  }

  /**
   * Runs a critical scheduled task exclusively across clustered worker instances.
   * Checks out a dedicated client from the pool and attempts to acquire a session-level
   * advisory lock without holding an open transaction snapshot.
   *
   * This allows long-running jobs (e.g. S3 deletion, batch processing) to execute their own
   * short, isolated transactions without blocking autovacuum or tying up transaction snapshots.
   * If another replica is already executing the task, skips execution cleanly.
   */
  async withExclusiveExecution<T>(
    key: string,
    fn: (signal?: AbortSignal) => Promise<T>,
  ): Promise<{ executed: boolean; result?: T }> {
    if (this.redisLock) {
      if (!this.redisLock.isAvailable()) {
        this.logger.warn(
          { key },
          "Redis lock authority is unavailable; failing closed to prevent split-brain dual execution",
        );
        return { executed: false };
      }
      return this.redisLock.withLock(key, fn);
    }

    const client = await this.pool.connect();
    let acquired = false;
    const controller = new AbortController();
    try {
      const check = await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock($1, hashtext($2)) as acquired",
        [ADVISORY_LOCK_NAMESPACE, key],
      );
      acquired = Boolean(check.rows[0]?.acquired);
      if (!acquired) {
        return { executed: false };
      }

      const result = await fn(controller.signal);
      return { executed: true, result };
    } finally {
      if (acquired) {
        try {
          await client.query("SELECT pg_advisory_unlock($1, hashtext($2))", [
            ADVISORY_LOCK_NAMESPACE,
            key,
          ]);
        } catch (unlockError) {
          this.logger.warn(
            { error: String(unlockError), key },
            "Failed to release session advisory lock",
          );
        }
      }
      client.release();
    }
  }

  /** Runs fn in a savepoint of the ambient transaction; a throw rolls back and propagates. */
  async withSavepoint<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.getTx()) return fn();
    return this.scopes.withSavepoint(fn);
  }
}
