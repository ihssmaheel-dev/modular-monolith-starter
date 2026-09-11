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

  it("should run fn directly without a transaction to serialize against", async () => {
    const scoped = scopedService();
    const fn = vi.fn(async () => "value");

    await expect(scoped.withAdvisoryLock("tenancy:owners:org-1", fn)).resolves.toBe("value");
    expect(fn).toHaveBeenCalledTimes(1);
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
});
