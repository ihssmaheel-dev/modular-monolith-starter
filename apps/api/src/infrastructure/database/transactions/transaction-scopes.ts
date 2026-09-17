import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { err, type Result } from "neverthrow";
import type { DrizzleDb } from "../database.service";
import type { TransactionError } from "./transaction.types";
import type { PinoLoggerService } from "../../logger/logger.service";
import { databaseErrorMetadata } from "../connection/database-error.utils";

/**
 * Advisory-lock namespace for all withAdvisoryLock critical sections.
 * Call sites prefix keys per invariant ("tenancy:owners:<id>",
 * "upload-quota:<userId>"). Single-bigint session locks (e.g. the
 * migration lock) live in a different overload space.
 */
export const ADVISORY_LOCK_NAMESPACE = 12100;
export const ADVISORY_LOCK_REQUIRES_TRANSACTION = "ADVISORY_LOCK_REQUIRES_TRANSACTION";

type AfterCommitCallback = () => Promise<void>;

/**
 * Nested-transaction mechanics for one ambient Drizzle transaction:
 * savepoint isolation and transaction-scoped advisory locks. Owned by
 * DatabaseService, which supplies the ambient transaction accessor.
 */
export class TransactionScopes {
  constructor(
    private readonly getTx: () => DrizzleDb | undefined,
    private readonly logger: Pick<PinoLoggerService, "error">,
    private readonly getAfterCommit: () => AfterCommitCallback[] | undefined,
  ) {}

  /**
   * Nested Result transaction: isolates the unit in a savepoint. An Err rolls
   * back to the savepoint and is returned, so the outer transaction stays
   * healthy and may continue or abort on the Err by its own policy. A throw
   * rolls back to the savepoint and propagates as TRANSACTION_FAILED without
   * poisoning the outer transaction.
   */
  async withSavepointResult<T, E>(
    fn: () => Promise<Result<T, E>>,
  ): Promise<Result<T, E | TransactionError>> {
    const name = this.nextSavepointName();
    const callbackCheckpoint = this.afterCommitCheckpoint();
    try {
      await this.runTxCommand(`SAVEPOINT "${name}"`);
      const inner = await fn();
      if (inner.isErr()) {
        await this.runTxCommand(`ROLLBACK TO SAVEPOINT "${name}"`);
        this.discardAfterCommitSince(callbackCheckpoint);
        return inner;
      }
      await this.runTxCommand(`RELEASE SAVEPOINT "${name}"`);
      return inner;
    } catch {
      await this.safeRollbackToSavepoint(name);
      this.discardAfterCommitSince(callbackCheckpoint);
      return err({ type: "TRANSACTION_FAILED" } as TransactionError);
    }
  }

  /**
   * Nested throwing transaction: isolates the unit in a savepoint. A throw
   * rolls back to the savepoint and propagates, leaving the outer
   * transaction healthy for the caller to handle.
   */
  async withSavepoint<T>(fn: () => Promise<T>): Promise<T> {
    const name = this.nextSavepointName();
    const callbackCheckpoint = this.afterCommitCheckpoint();
    await this.runTxCommand(`SAVEPOINT "${name}"`);
    try {
      const value = await fn();
      await this.runTxCommand(`RELEASE SAVEPOINT "${name}"`);
      return value;
    } catch (error) {
      await this.safeRollbackToSavepoint(name);
      this.discardAfterCommitSince(callbackCheckpoint);
      throw error;
    }
  }

  /**
   * Serializes a critical section per key with a transaction-scoped advisory
   * lock (pg_advisory_xact_lock). The lock releases automatically at COMMIT
   * or ROLLBACK, so it cannot leak. Callers must hold a unit of work: without
   * an ambient transaction the invariant cannot be protected, so this fails
   * closed. Use sparingly for check-then-write invariants (last owner, quota
   * reservations) — never as a general mutation lock.
   */
  async withAdvisoryLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const tx = this.getTx();
    const execute = (tx as unknown as { execute?: (query: unknown) => Promise<unknown> })?.execute;
    if (!tx || typeof execute !== "function") {
      throw new Error(ADVISORY_LOCK_REQUIRES_TRANSACTION);
    }
    await execute.call(
      tx,
      sql`select pg_advisory_xact_lock(${ADVISORY_LOCK_NAMESPACE}, hashtext(${key}))`,
    );
    return fn();
  }

  /**
   * Attempts to acquire a transaction-scoped advisory lock without blocking.
   * If another transaction holds the lock, returns { acquired: false } immediately.
   * If acquired, runs fn() and returns { acquired: true, result: await fn() }.
   */
  async tryAdvisoryLock<T>(
    key: string,
    fn: () => Promise<T>,
  ): Promise<{ acquired: boolean; result?: T }> {
    const tx = this.getTx();
    const execute = (tx as unknown as { execute?: (query: unknown) => Promise<unknown> })?.execute;
    if (!tx || typeof execute !== "function") {
      throw new Error(ADVISORY_LOCK_REQUIRES_TRANSACTION);
    }
    const res = await execute.call(
      tx,
      sql`select pg_try_advisory_xact_lock(${ADVISORY_LOCK_NAMESPACE}, hashtext(${key})) as acquired`,
    );
    const rows =
      (res as { rows?: Array<{ acquired: boolean }> })?.rows ?? (Array.isArray(res) ? res : []);
    const acquired = Boolean((rows[0] as { acquired?: boolean })?.acquired);
    if (!acquired) {
      return { acquired: false };
    }
    const result = await fn();
    return { acquired: true, result };
  }

  private nextSavepointName(): string {
    return `sp_${randomUUID().replace(/-/g, "")}`;
  }

  private afterCommitCheckpoint(): number {
    return this.getAfterCommit()?.length ?? 0;
  }

  private discardAfterCommitSince(checkpoint: number): void {
    const callbacks = this.getAfterCommit();
    if (callbacks && callbacks.length > checkpoint) callbacks.splice(checkpoint);
  }

  /** Drains queued after-commit callbacks; failures are logged, never thrown. */
  async drainAfterCommit(callbacks: Array<() => Promise<void>>): Promise<void> {
    for (const callback of callbacks) {
      try {
        await callback();
      } catch (error) {
        this.logger.error({ error: String(error) }, "After-commit callback failed");
      }
    }
  }

  private async runTxCommand(command: string): Promise<void> {
    const tx = this.getTx();
    const execute = (tx as unknown as { execute?: (query: unknown) => Promise<unknown> })?.execute;
    if (typeof execute !== "function" || !tx) return;
    await execute.call(tx, sql.raw(command));
  }

  private async safeRollbackToSavepoint(name: string): Promise<void> {
    try {
      await this.runTxCommand(`ROLLBACK TO SAVEPOINT "${name}"`);
    } catch (error) {
      this.logger.error(databaseErrorMetadata(error), "Savepoint rollback failed");
    }
  }
}
