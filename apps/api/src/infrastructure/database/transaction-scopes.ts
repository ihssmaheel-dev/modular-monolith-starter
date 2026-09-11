import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { err, type Result } from "neverthrow";
import type { DrizzleDb } from "./database.service";
import type { TransactionError } from "./database.types";
import type { PinoLoggerService } from "../logger/logger.service";

/**
 * Advisory-lock namespace for all withAdvisoryLock critical sections.
 * Call sites prefix keys per invariant ("tenancy:owners:<id>",
 * "upload-quota:<userId>"). Single-bigint session locks (e.g. the
 * migration lock) live in a different overload space.
 */
export const ADVISORY_LOCK_NAMESPACE = 12100;

/**
 * Nested-transaction mechanics for one ambient Drizzle transaction:
 * savepoint isolation and transaction-scoped advisory locks. Owned by
 * DatabaseService, which supplies the ambient transaction accessor.
 */
export class TransactionScopes {
  constructor(
    private readonly getTx: () => DrizzleDb | undefined,
    private readonly logger: Pick<PinoLoggerService, "error">,
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
    try {
      await this.runTxCommand(`SAVEPOINT "${name}"`);
      const inner = await fn();
      if (inner.isErr()) {
        await this.runTxCommand(`ROLLBACK TO SAVEPOINT "${name}"`);
        return inner;
      }
      await this.runTxCommand(`RELEASE SAVEPOINT "${name}"`);
      return inner;
    } catch {
      await this.safeRollbackToSavepoint(name);
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
    await this.runTxCommand(`SAVEPOINT "${name}"`);
    try {
      const value = await fn();
      await this.runTxCommand(`RELEASE SAVEPOINT "${name}"`);
      return value;
    } catch (error) {
      await this.safeRollbackToSavepoint(name);
      throw error;
    }
  }

  /**
   * Serializes a critical section per key with a transaction-scoped advisory
   * lock (pg_advisory_xact_lock). The lock releases automatically at COMMIT
   * or ROLLBACK, so it cannot leak. Callers must hold a unit of work: without
   * an ambient transaction there is nothing to serialize against, so fn runs
   * directly. Use sparingly for check-then-write invariants (last owner,
   * quota reservations) — never as a general mutation lock.
   */
  async withAdvisoryLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const tx = this.getTx();
    const execute = (tx as unknown as { execute?: (query: unknown) => Promise<unknown> })?.execute;
    if (!tx || typeof execute !== "function") return fn();
    await execute.call(
      tx,
      sql`select pg_advisory_xact_lock(${ADVISORY_LOCK_NAMESPACE}, hashtext(${key}))`,
    );
    return fn();
  }

  private nextSavepointName(): string {
    return `sp_${randomUUID().replace(/-/g, "")}`;
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
      this.logger.error({ error: String(error) }, "Savepoint rollback failed");
    }
  }
}
