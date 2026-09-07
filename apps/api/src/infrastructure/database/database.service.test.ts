import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PinoLoggerService } from "../logger/logger.service";
import { DatabaseService } from "./database.service";
import { err } from "neverthrow";

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
      runWith: vi.fn(async (_ctx, fn) => await (fn as () => Promise<unknown>)()),
    } as unknown as never;

    service = new DatabaseService(mockLogger as never, mockCls as never);
  });

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

  it("should defer emission until the ambient transaction commits", async () => {
    const callbacks: Array<() => Promise<void>> = [];
    const mockCls = {
      isActive: vi.fn().mockReturnValue(true),
      get: vi.fn((key?: string) => {
        if (key === "databaseTx") return {};
        if (key === "afterCommit") return callbacks;
        return undefined;
      }),
      set: vi.fn(),
      runWith: vi.fn(async (_ctx, fn) => await (fn as () => Promise<unknown>)()),
    } as unknown as never;
    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as PinoLoggerService;
    const scoped = new DatabaseService(mockLogger as never, mockCls);
    const emitter = { emitAsync: vi.fn().mockResolvedValue([]) };

    await scoped.emitAfterCommit(emitter as never, "test.event", {});
    expect(emitter.emitAsync).not.toHaveBeenCalled();

    for (const callback of callbacks) await callback();
    expect(emitter.emitAsync).toHaveBeenCalledTimes(1);
  });
});
