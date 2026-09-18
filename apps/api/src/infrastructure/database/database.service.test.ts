import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PinoLoggerService } from "../logger/logger.service";
import { DatabaseService } from "./database.service";
import { err, ok } from "neverthrow";

vi.mock("pg", () => {
  return {
    Pool: class {
      on = vi.fn();
      end = vi.fn();
      query = vi.fn();
      connect = vi.fn(async () => ({
        query: vi.fn(async () => ({ rows: [{ acquired: true }] })),
        release: vi.fn(),
      }));
    },
  };
});
vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn(() => ({
    transaction: vi.fn(async (cb) => cb({})),
  })),
}));

describe("DatabaseService", () => {
  let service: DatabaseService;

  beforeEach(() => {
    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as PinoLoggerService;
    const mockCls = {
      isActive: vi.fn().mockReturnValue(false),
      get: vi.fn(),
      set: vi.fn(),
      runWith: vi.fn(async (_ctx, fn) => await (fn as () => Promise<unknown>)()),
    } as unknown as never;

    service = new DatabaseService(mockLogger as never, mockCls as never);
  });

  function scopedService(context: Record<string, unknown> = {}) {
    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as PinoLoggerService;
    let current: Record<string, unknown> = { ...context };
    const mockCls = {
      isActive: vi.fn().mockReturnValue(true),
      get: vi.fn((key?: string) => (key === undefined ? current : current[key])),
      set: vi.fn((key: string, value: unknown) => {
        current[key] = value;
      }),
      runWith: vi.fn(async (ctx: Record<string, unknown>, fn: () => Promise<unknown>) => {
        const previous = current;
        current = { ...ctx };
        try {
          return await fn();
        } finally {
          current = previous;
        }
      }),
    } as unknown as never;
    return new DatabaseService(mockLogger as never, mockCls as never);
  }

  it("should report connection status", () => {
    expect(service.isConnected()).toBe(true);
  });

  it("should execute transaction successfully", async () => {
    const result = await service.withTransaction(async () => ({ id: 1 }));
    expect(result.isOk()).toBe(true);
  });

  it("should propagate result transaction", async () => {
    const result = await service.withResultTransaction(async () =>
      err({ type: "EXPECTED" } as never),
    );
    expect(result.isErr()).toBe(true);
  });

  it("wraps system-scoped work in a transaction when none is active", async () => {
    const transaction = vi.spyOn(service, "runTransaction");

    await service.withSystemScope(async () => undefined);

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("should emit immediately when no transaction is active", async () => {
    const emitter = { emitAsync: vi.fn().mockResolvedValue([]) };

    await service.emitAfterCommit(emitter as never, "test.event", { id: 1 });

    expect(emitter.emitAsync).toHaveBeenCalledWith("test.event", { id: 1 });
  });

  it("writes mutation audit evidence in the active business transaction", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const tx = { insert: vi.fn().mockReturnValue({ values }) };
    const scoped = scopedService({ databaseTx: tx, systemScope: true });
    const emitter = { emitAsync: vi.fn() };

    await scoped.emitAfterCommit(emitter as never, "database.mutated", {
      collectionName: "users",
      documentId: "user-1",
      action: "UPDATE",
      actorId: "user-1",
      before: { refreshToken: "old" },
      after: { refreshToken: "new" },
    });

    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        before: { refreshToken: "[REDACTED]" },
        after: { refreshToken: "[REDACTED]" },
      }),
    );
    expect(emitter.emitAsync).not.toHaveBeenCalled();
  });

  it("fails the business unit when its required audit write fails", async () => {
    const tx = {
      insert: vi
        .fn()
        .mockReturnValue({ values: vi.fn().mockRejectedValue(new Error("audit down")) }),
    };
    const scoped = scopedService({ databaseTx: tx, systemScope: true });

    await expect(
      scoped.emitAfterCommit({} as never, "database.mutated", {
        collectionName: "invoices",
        documentId: "invoice-1",
        action: "CREATE",
        before: null,
        after: { id: "invoice-1" },
      }),
    ).rejects.toThrow("audit down");
  });

  it("should swallow listener errors without throwing", async () => {
    const emitter = { emitAsync: vi.fn().mockRejectedValue(new Error("boom")) };

    await expect(
      service.emitAfterCommit(emitter as never, "test.event", {}),
    ).resolves.toBeUndefined();
  });

  it("should run after-commit effects only after COMMIT, never before", async () => {
    const order: string[] = [];
    const scoped = scopedService();
    const db = scoped.getDb() as unknown as {
      transaction: ReturnType<typeof vi.fn>;
    };
    db.transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      const value = await cb({});
      order.push("commit");
      return value;
    });
    const emitter = {
      emitAsync: vi.fn().mockImplementation(async () => {
        order.push("effect");
        return [];
      }),
    };

    const result = await scoped.withResultTransaction(async () => {
      await scoped.emitAfterCommit(emitter as never, "test.event", {});
      expect(emitter.emitAsync).not.toHaveBeenCalled();
      return ok(1);
    });

    expect(result.isOk()).toBe(true);
    expect(order).toEqual(["commit", "effect"]);
    expect(emitter.emitAsync).toHaveBeenCalledTimes(1);
  });

  it("should discard after-commit effects when the transaction rolls back", async () => {
    const scoped = scopedService();
    const db = scoped.getDb() as unknown as {
      transaction: ReturnType<typeof vi.fn>;
    };
    db.transaction = vi.fn(async () => {
      throw new Error("commit failed");
    });
    const emitter = { emitAsync: vi.fn().mockResolvedValue([]) };

    const result = await scoped.withResultTransaction(async () => {
      await scoped.emitAfterCommit(emitter as never, "test.event", {});
      return ok(1);
    });

    expect(result.isErr()).toBe(true);
    expect(emitter.emitAsync).not.toHaveBeenCalled();
  });

  it("should roll back a nested Err to a savepoint and keep the outer transaction usable", async () => {
    const executed: string[] = [];
    const tx = {
      execute: vi.fn().mockImplementation(async (query: unknown) => {
        executed.push(JSON.stringify(query));
        return [];
      }),
    };
    const scoped = scopedService({ databaseTx: tx });

    const result = await scoped.withResultTransaction(async () =>
      err({ type: "EXPECTED" } as never),
    );

    expect(result.isErr()).toBe(true);
    expect(executed.some((sql) => sql.includes("SAVEPOINT"))).toBe(true);
    expect(executed.some((sql) => sql.includes("ROLLBACK TO SAVEPOINT"))).toBe(true);
    expect(executed.some((sql) => sql.includes("RELEASE"))).toBe(false);
  });

  it("discards after-commit effects registered by a rolled-back savepoint", async () => {
    const scoped = scopedService({ afterCommit: [] });
    const emitter = { emitAsync: vi.fn().mockResolvedValue([]) };
    const tx = { execute: vi.fn().mockResolvedValue([]) };
    const context = (scoped as unknown as { cls: { set: (key: string, value: unknown) => void } })
      .cls;
    context.set("databaseTx", tx);

    const result = await scoped.withResultTransaction(async () => {
      await scoped.emitAfterCommit(emitter as never, "rolled-back.event", {});
      return err({ type: "EXPECTED" } as never);
    });

    expect(result.isErr()).toBe(true);
    const callbacks = (
      scoped as unknown as { cls: { get: (key: string) => Array<() => Promise<void>> } }
    ).cls.get("afterCommit");
    expect(callbacks).toHaveLength(0);
    expect(emitter.emitAsync).not.toHaveBeenCalled();
  });

  it("should release the savepoint when nested work succeeds", async () => {
    const executed: string[] = [];
    const tx = {
      execute: vi.fn().mockImplementation(async (query: unknown) => {
        executed.push(JSON.stringify(query));
        return [];
      }),
    };
    const scoped = scopedService({ databaseTx: tx });

    const result = await scoped.withResultTransaction(async () => ok(1));

    expect(result.isOk()).toBe(true);
    expect(executed.some((sql) => sql.includes("SAVEPOINT"))).toBe(true);
    expect(executed.some((sql) => sql.includes("RELEASE SAVEPOINT"))).toBe(true);
  });

  it("should switch and restore SQL scope around ambient work", async () => {
    const configured: string[] = [];
    const tx = {
      execute: vi.fn().mockImplementation(async (query: { sql: string }) => {
        configured.push(JSON.stringify(query));
        return [];
      }),
    };
    const scoped = scopedService({ databaseTx: tx, tenantId: "tenant-before" });

    await scoped.withTenantScope("tenant-next", async () => undefined);

    const setConfigs = configured.filter((sql) => sql.includes("app.current_tenant"));
    expect(setConfigs.length).toBe(2);
    expect(setConfigs[0]).toContain("tenant-next");
    expect(setConfigs[1]).toContain("tenant-before");
  });

  it("should open a transaction from matching CLS scope when none is active", async () => {
    const configured: string[] = [];
    const scoped = scopedService({ tenantId: "tenant-next" });
    const db = scoped.getDb() as unknown as {
      transaction: ReturnType<typeof vi.fn>;
    };
    db.transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn().mockImplementation(async (query: { sql: string }) => {
          configured.push(JSON.stringify(query));
          return [];
        }),
      };
      return cb(tx);
    });
    const result = await scoped.withTenantScope("tenant-next", async () => ok(1));

    expect(result.isOk() && result.value).toBe(1);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(configured.some((sql) => sql.includes("tenant-next"))).toBe(true);
  });

  it("should hold an advisory lock for the critical section", async () => {
    const executed: string[] = [];
    const tx = {
      execute: vi.fn().mockImplementation(async (query: { sql: string }) => {
        executed.push(JSON.stringify(query));
        return [];
      }),
    };
    const scoped = scopedService({ databaseTx: tx });
    const fn = vi.fn(async () => "value");

    await expect(scoped.withAdvisoryLock("tenancy:owners:org-1", fn)).resolves.toBe("value");
    expect(fn).toHaveBeenCalledTimes(1);
    const lockCall = executed.find((sql) => sql.includes("pg_advisory_xact_lock"));
    expect(lockCall).toContain("tenancy:owners:org-1");
  });

  it("should fail closed without a transaction to serialize against", async () => {
    const scoped = scopedService();
    const fn = vi.fn(async () => "value");

    await expect(scoped.withAdvisoryLock("tenancy:owners:org-1", fn)).rejects.toThrow(
      "ADVISORY_LOCK_REQUIRES_TRANSACTION",
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("should run fn unchanged without CLS", async () => {
    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as PinoLoggerService;
    const noCls = new DatabaseService(mockLogger as never);
    const fn = vi.fn(async () => "value");

    await expect(noCls.withTenantScope("tenant-x", fn)).resolves.toBe("value");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should roll back the savepoint and rethrow when nested work throws", async () => {
    const executed: string[] = [];
    const tx = {
      execute: vi.fn().mockImplementation(async (query: unknown) => {
        executed.push(JSON.stringify(query));
        return [];
      }),
    };
    const scoped = scopedService({ databaseTx: tx });

    await expect(
      scoped.runTransaction(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(executed.some((sql) => sql.includes("SAVEPOINT"))).toBe(true);
    expect(executed.some((sql) => sql.includes("ROLLBACK TO SAVEPOINT"))).toBe(true);
  });

  describe("withExclusiveExecution", () => {
    it("acquires session lock, executes fn, releases lock, and releases client", async () => {
      const mockQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ acquired: true }] })
        .mockResolvedValueOnce({ rows: [] });
      const mockRelease = vi.fn();
      const mockConnect = vi.fn().mockResolvedValue({
        query: mockQuery,
        release: mockRelease,
      });
      const pool = service.getPool();
      vi.spyOn(pool, "connect").mockImplementation(mockConnect as never);

      const fn = vi.fn(async () => "result-data");
      const result = await service.withExclusiveExecution("test-job", fn);

      expect(result).toEqual({ executed: true, result: "result-data" });
      expect(fn).toHaveBeenCalledTimes(1);
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[0]?.[0]).toContain("pg_try_advisory_lock");
      expect(mockQuery.mock.calls[1]?.[0]).toContain("pg_advisory_unlock");
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("skips execution cleanly if lock is not acquired", async () => {
      const mockQuery = vi.fn().mockResolvedValueOnce({ rows: [{ acquired: false }] });
      const mockRelease = vi.fn();
      const mockConnect = vi.fn().mockResolvedValue({
        query: mockQuery,
        release: mockRelease,
      });
      const pool = service.getPool();
      vi.spyOn(pool, "connect").mockImplementation(mockConnect as never);

      const fn = vi.fn(async () => "result-data");
      const result = await service.withExclusiveExecution("test-job", fn);

      expect(result).toEqual({ executed: false });
      expect(fn).not.toHaveBeenCalled();
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("releases lock and client even if fn throws", async () => {
      const mockQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ acquired: true }] })
        .mockResolvedValueOnce({ rows: [] });
      const mockRelease = vi.fn();
      const mockConnect = vi.fn().mockResolvedValue({
        query: mockQuery,
        release: mockRelease,
      });
      const pool = service.getPool();
      vi.spyOn(pool, "connect").mockImplementation(mockConnect as never);

      const fn = vi.fn(async () => {
        throw new Error("worker task crashed");
      });

      await expect(service.withExclusiveExecution("test-job", fn)).rejects.toThrow(
        "worker task crashed",
      );
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[1]?.[0]).toContain("pg_advisory_unlock");
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it("delegates to RedisLockService when available (PgBouncer compatibility)", async () => {
      const mockRedisLock = {
        isAvailable: vi.fn().mockReturnValue(true),
        withLock: vi.fn().mockResolvedValue({ executed: true, result: "redis-locked" }),
      };
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        child: vi.fn().mockReturnThis(),
      };
      const serviceWithRedis = new DatabaseService(
        mockLogger as never,
        undefined,
        undefined,
        mockRedisLock as never,
      );
      const fn = vi.fn();
      const result = await serviceWithRedis.withExclusiveExecution("test-job", fn);

      expect(result).toEqual({ executed: true, result: "redis-locked" });
      expect(mockRedisLock.withLock).toHaveBeenCalledWith("test-job", fn);
    });
  });
});
