import { describe, expect, it, vi, beforeEach } from "vitest";
import { RedisLockService } from "./redis-lock.service";
import type { RedisService } from "./redis.service";
import type { PinoLoggerService } from "../logger/logger.service";

describe("RedisLockService", () => {
  let lockService: RedisLockService;
  let mockRedisClient: {
    set: ReturnType<typeof vi.fn>;
    eval: ReturnType<typeof vi.fn>;
  };
  let mockRedis: { getClient: ReturnType<typeof vi.fn> };
  let mockLogger: {
    child: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisClient = {
      set: vi.fn(),
      eval: vi.fn(),
    };
    mockRedis = {
      getClient: vi.fn().mockReturnValue(mockRedisClient),
    };
    mockLogger = {
      child: vi.fn().mockReturnThis(),
      error: vi.fn(),
      warn: vi.fn(),
    };
    lockService = new RedisLockService(
      mockRedis as unknown as RedisService,
      mockLogger as unknown as PinoLoggerService,
    );
  });

  describe("isAvailable", () => {
    it("returns true when Redis client is connected", () => {
      expect(lockService.isAvailable()).toBe(true);
    });

    it("returns false when Redis client is not available", () => {
      mockRedis.getClient.mockReturnValue(null);
      expect(lockService.isAvailable()).toBe(false);
    });
  });

  describe("acquire", () => {
    it("acquires lock with unique token using SET NX PX", async () => {
      mockRedisClient.set.mockResolvedValue("OK");

      const handle = await lockService.acquire("retention-job", 30_000);

      expect(handle.acquired).toBe(true);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        "lock:retention-job",
        expect.any(String),
        "PX",
        30_000,
        "NX",
      );
    });

    it("fails to acquire when another worker holds lock", async () => {
      mockRedisClient.set.mockResolvedValue(null);

      const handle = await lockService.acquire("retention-job", 30_000);

      expect(handle.acquired).toBe(false);
    });

    it("handles Redis error gracefully during acquisition", async () => {
      mockRedisClient.set.mockRejectedValue(new Error("Redis connection closed"));

      const handle = await lockService.acquire("retention-job", 30_000);

      expect(handle.acquired).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it("releases lock via Lua script matching token", async () => {
      mockRedisClient.set.mockResolvedValue("OK");
      mockRedisClient.eval.mockResolvedValue(1);

      const handle = await lockService.acquire("retention-job", 30_000);
      await handle.release();

      expect(mockRedisClient.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("get", KEYS[1]) == ARGV[1]'),
        1,
        "lock:retention-job",
        expect.any(String),
      );
    });

    it("renews lock via Lua script and returns true on success", async () => {
      mockRedisClient.set.mockResolvedValue("OK");
      mockRedisClient.eval.mockResolvedValue(1);

      const handle = await lockService.acquire("retention-job", 30_000);
      const renewed = await handle.renew(45_000);

      expect(renewed).toBe(true);
      expect(mockRedisClient.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("pexpire", KEYS[1], ARGV[2])'),
        1,
        "lock:retention-job",
        expect.any(String),
        45_000,
      );
    });

    it("returns false when renew fails or lock ownership is lost", async () => {
      mockRedisClient.set.mockResolvedValue("OK");
      mockRedisClient.eval.mockResolvedValue(0);

      const handle = await lockService.acquire("retention-job", 30_000);
      const renewed = await handle.renew();

      expect(renewed).toBe(false);
    });
  });

  describe("withLock", () => {
    it("executes fn exclusively and releases lock upon completion", async () => {
      mockRedisClient.set.mockResolvedValue("OK");
      mockRedisClient.eval.mockResolvedValue(1);

      const fn = vi.fn().mockResolvedValue("work-completed");
      const result = await lockService.withLock("sync-job", fn);

      expect(result).toEqual({ executed: true, result: "work-completed" });
      expect(fn).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.eval).toHaveBeenCalledTimes(1);
    });

    it("auto-renews lock via heartbeat timer for long-running jobs", async () => {
      vi.useFakeTimers();
      try {
        mockRedisClient.set.mockResolvedValue("OK");
        mockRedisClient.eval.mockResolvedValue(1);

        let resolveFn: (val: string) => void;
        const delayedPromise = new Promise<string>((res) => {
          resolveFn = res;
        });

        const withLockPromise = lockService.withLock("long-job", async () => delayedPromise, 3_000);

        // Advance 1.5s (heartbeat interval for 3000ms is max(1000, 1000) = 1000ms)
        await vi.advanceTimersByTimeAsync(1100);
        expect(mockRedisClient.eval).toHaveBeenCalledWith(
          expect.stringContaining('redis.call("pexpire", KEYS[1], ARGV[2])'),
          1,
          "lock:long-job",
          expect.any(String),
          3_000,
        );

        resolveFn!("done");
        const result = await withLockPromise;
        expect(result).toEqual({ executed: true, result: "done" });
      } finally {
        vi.useRealTimers();
      }
    });

    it("skips execution cleanly if lock cannot be acquired", async () => {
      mockRedisClient.set.mockResolvedValue(null);

      const fn = vi.fn();
      const result = await lockService.withLock("sync-job", fn);

      expect(result).toEqual({ executed: false });
      expect(fn).not.toHaveBeenCalled();
      expect(mockRedisClient.eval).not.toHaveBeenCalled();
    });

    it("releases lock even when worker function throws (crash recovery)", async () => {
      mockRedisClient.set.mockResolvedValue("OK");
      mockRedisClient.eval.mockResolvedValue(1);

      const fn = vi.fn().mockRejectedValue(new Error("Worker task crashed unexpectedly"));

      await expect(lockService.withLock("sync-job", fn)).rejects.toThrow(
        "Worker task crashed unexpectedly",
      );
      expect(mockRedisClient.eval).toHaveBeenCalledTimes(1);
    });
  });
});
