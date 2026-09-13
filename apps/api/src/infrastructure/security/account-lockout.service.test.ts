import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AccountLockoutService, MAX_MEMORY_LOCKOUT_ENTRIES } from "./account-lockout.service";
import type { PinoLoggerService } from "../logger/logger.service";
import type { RedisService } from "../redis/redis.service";

describe("AccountLockoutService", () => {
  let service: AccountLockoutService;
  let mockLogger: PinoLoggerService;
  let mockRedisService: RedisService;
  let mockRedisClient: {
    get: ReturnType<typeof vi.fn>;
    incr: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    ttl: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockLogger = {
      child: vi.fn().mockReturnThis(),
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    } as unknown as PinoLoggerService;

    mockRedisClient = {
      get: vi.fn().mockResolvedValue(null),
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      del: vi.fn().mockResolvedValue(1),
      ttl: vi.fn().mockResolvedValue(600),
    };

    mockRedisService = {
      getClient: vi.fn().mockReturnValue(mockRedisClient),
    } as unknown as RedisService;

    service = new AccountLockoutService(mockRedisService, mockLogger);
  });

  afterEach(async () => {
    await service.onApplicationShutdown();
    vi.useRealTimers();
  });

  describe("with Redis available", () => {
    it("locks out user when max attempts are exceeded", async () => {
      mockRedisClient.get.mockResolvedValue("5");
      mockRedisClient.ttl.mockResolvedValue(300);

      const isLocked = await service.isLockedOut("victim@example.com");
      expect(isLocked).toBe(true);
    });

    it("allows user when below max attempts", async () => {
      mockRedisClient.get.mockResolvedValue("2");

      const isLocked = await service.isLockedOut("user@example.com");
      expect(isLocked).toBe(false);
    });

    it("records failed attempt and sets TTL on first failure", async () => {
      mockRedisClient.incr.mockResolvedValue(1);

      await service.recordFailedAttempt("user@example.com");
      expect(mockRedisClient.incr).toHaveBeenCalledWith("lockout:user@example.com");
      expect(mockRedisClient.expire).toHaveBeenCalled();
    });

    it("resets failed attempts on success", async () => {
      await service.resetAttempts("user@example.com");
      expect(mockRedisClient.del).toHaveBeenCalledWith("lockout:user@example.com");
    });
  });

  describe("with in-memory fallback (no Redis)", () => {
    beforeEach(() => {
      vi.mocked(mockRedisService.getClient).mockReturnValue(null);
      service = new AccountLockoutService(mockRedisService, mockLogger);
    });

    it("tracks attempts in-memory and locks out after threshold", async () => {
      const email = "attacker@example.com";
      expect(await service.isLockedOut(email)).toBe(false);

      for (let i = 0; i < 5; i++) {
        await service.recordFailedAttempt(email);
      }

      expect(await service.isLockedOut(email)).toBe(true);

      await service.resetAttempts(email);
      expect(await service.isLockedOut(email)).toBe(false);
    });

    it("bounds memoryStore to MAX_MEMORY_LOCKOUT_ENTRIES and evicts oldest", async () => {
      await service.recordFailedAttempt("first@example.com");
      for (let i = 1; i < MAX_MEMORY_LOCKOUT_ENTRIES; i++) {
        await service.recordFailedAttempt(`user${i}@example.com`);
      }
      expect(service.memorySize).toBe(MAX_MEMORY_LOCKOUT_ENTRIES);

      // Adding one more should evict 'first@example.com'
      await service.recordFailedAttempt("overflow@example.com");
      expect(service.memorySize).toBe(MAX_MEMORY_LOCKOUT_ENTRIES);
      expect(await service.isLockedOut("first@example.com")).toBe(false);
    });

    it("sweeps expired attempts", async () => {
      vi.useFakeTimers();
      const startTime = new Date(2026, 0, 1, 12, 0, 0);
      vi.setSystemTime(startTime);

      await service.recordFailedAttempt("user1@example.com");
      await service.recordFailedAttempt("user2@example.com");

      expect(service.memorySize).toBe(2);

      // Advance past lockout duration (default 15 minutes = 900,000 ms)
      vi.setSystemTime(new Date(startTime.getTime() + 16 * 60 * 1000));

      const evicted = service.sweepExpired();
      expect(evicted).toBe(2);
      expect(service.memorySize).toBe(0);
    });

    it("clears memoryStore and cancels timer on application shutdown", async () => {
      await service.recordFailedAttempt("user@example.com");
      expect(service.memorySize).toBe(1);

      await service.onApplicationShutdown();
      expect(service.memorySize).toBe(0);
    });
  });
});
