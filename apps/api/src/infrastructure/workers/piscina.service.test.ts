import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { PiscinaService, getOptimalWorkerThreadCount } from "./piscina.service";
import type { PinoLoggerService } from "../logger/logger.service";

describe("PiscinaService", () => {
  let service: PiscinaService;
  let mockLogger: PinoLoggerService;
  const sampleTaskPath = path.resolve(__dirname, "./tasks/sample-compute.task.ts");

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as PinoLoggerService;

    service = new PiscinaService(mockLogger);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe("getOptimalWorkerThreadCount", () => {
    it("returns at least 1 worker thread", () => {
      const count = getOptimalWorkerThreadCount();
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getPool", () => {
    it("initializes a pool with default bounded configuration", () => {
      const pool = service.getPool({
        name: "test-pool",
        filename: sampleTaskPath,
      });

      expect(pool).toBeDefined();
      const stats = service.getStats("test-pool");
      expect(stats).not.toBeNull();
      expect(stats?.maxQueue).toBe(1_000);
      expect(stats?.queueSize).toBe(0);
    });

    it("reuses existing pool instance when called with same name", () => {
      const pool1 = service.getPool({
        name: "cached-pool",
        filename: sampleTaskPath,
      });
      const pool2 = service.getPool({
        name: "cached-pool",
        filename: sampleTaskPath,
      });

      expect(pool1).toBe(pool2);
    });

    it("respects custom thread and queue limits", () => {
      service.getPool({
        name: "custom-pool",
        filename: sampleTaskPath,
        maxThreads: 2,
        minThreads: 1,
        maxQueue: 50,
        idleTimeoutMs: 15_000,
      });

      const stats = service.getStats("custom-pool");
      expect(stats?.maxThreads).toBe(2);
      expect(stats?.maxQueue).toBe(50);
    });

    it("warns when worker script file does not exist", () => {
      service.getPool({
        name: "missing-pool",
        filename: path.resolve(__dirname, "./non-existent.js"),
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ pool: "missing-pool" }),
        "Worker pool script path does not exist on disk",
      );
    });
  });

  describe("getStats", () => {
    it("returns null for non-existent pool", () => {
      expect(service.getStats("unknown-pool")).toBeNull();
    });
  });

  describe("run", () => {
    it("throws error if pool was not initialized", async () => {
      await expect(service.run("uninitialized", "task", {})).rejects.toThrow(
        'Worker pool "uninitialized" not found. Call getPool() first.',
      );
    });

    it("executes named CPU task in worker thread", async () => {
      service.getPool({
        name: "compute-pool",
        filename: sampleTaskPath,
        maxThreads: 2,
      });

      const result = await service.run<{ numbers: number[] }, number>(
        "compute-pool",
        "sumNumbers",
        { numbers: [1, 2, 3, 4, 5] },
      );

      expect(result).toBe(15);
    });

    it("executes default task when task name is omitted", async () => {
      service.getPool({
        name: "default-task-pool",
        filename: sampleTaskPath,
        maxThreads: 2,
      });

      const result = await service.run<number[], number>(
        "default-task-pool",
        undefined,
        [10, 20, 30],
      );

      expect(result).toBe(60);
    });

    it("enforces bounded queue limit and rejects excess tasks", async () => {
      service.getPool({
        name: "bounded-pool",
        filename: sampleTaskPath,
        maxThreads: 1,
        maxQueue: 1,
      });

      const tasks: Promise<unknown>[] = [];
      let rejected = false;

      try {
        for (let i = 0; i < 50; i++) {
          tasks.push(
            service.run("bounded-pool", "sumNumbers", {
              numbers: Array.from({ length: 10_000 }, (_, idx) => idx),
            }),
          );
        }
        await Promise.all(tasks);
      } catch (err: unknown) {
        rejected = true;
        expect((err as Error).message).toContain("Task queue is at limit");
      }

      expect(rejected).toBe(true);
    });
  });

  describe("onModuleDestroy", () => {
    it("cleans up and destroys all active pools", async () => {
      service.getPool({
        name: "pool-to-destroy",
        filename: sampleTaskPath,
      });

      await service.onModuleDestroy();

      expect(service.getStats("pool-to-destroy")).toBeNull();
    });
  });
});
