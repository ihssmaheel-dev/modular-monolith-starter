import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DistributedCacheService, MAX_CACHE_SIZE } from "./distributed-cache.service";
import type { RedisService } from "../redis/redis.service";
import type { CacheMetricsService } from "./cache-metrics.service";
import type { PinoLoggerService } from "../logger/logger.service";

describe("DistributedCacheService", () => {
  let service: DistributedCacheService;
  let mockLogger: PinoLoggerService;
  let mockMetrics: CacheMetricsService;
  let mockRedisService: RedisService;
  let mockRedisClient: {
    duplicate: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
  };
  let mockSubscriber: {
    subscribe: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();

    mockLogger = {
      child: vi.fn().mockReturnThis(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    } as unknown as PinoLoggerService;

    mockMetrics = {
      recordHit: vi.fn(),
      recordMiss: vi.fn(),
      recordSet: vi.fn(),
      recordEvict: vi.fn(),
    } as unknown as CacheMetricsService;

    mockSubscriber = {
      subscribe: vi.fn().mockResolvedValue("OK"),
      on: vi.fn(),
      quit: vi.fn().mockResolvedValue("OK"),
      disconnect: vi.fn(),
    };

    mockRedisClient = {
      duplicate: vi.fn().mockReturnValue(mockSubscriber),
      publish: vi.fn().mockResolvedValue(1),
    };

    mockRedisService = {
      getClient: vi.fn().mockReturnValue(mockRedisClient),
    } as unknown as RedisService;

    service = new DistributedCacheService(mockRedisService, mockMetrics, mockLogger);
  });

  afterEach(async () => {
    await service.onApplicationShutdown();
    vi.useRealTimers();
  });

  it("stores and retrieves cached items before TTL expires", () => {
    service.set("key1", "val1", 60);
    expect(service.get("key1")).toBe("val1");
    expect(mockMetrics.recordHit).toHaveBeenCalledWith("memory");
  });

  it("evicts expired items on read", () => {
    service.set("key1", "val1", 10);
    vi.advanceTimersByTime(11_000);

    expect(service.get("key1")).toBeUndefined();
    expect(mockMetrics.recordMiss).toHaveBeenCalledWith("memory");
  });

  it("sweeps expired items in bulk via sweepExpired", () => {
    service.set("expired1", "val1", 5);
    service.set("expired2", "val2", 5);
    service.set("active", "val3", 60);

    vi.advanceTimersByTime(6_000);

    const evicted = service.sweepExpired();
    expect(evicted).toBe(2);
    expect(service.size).toBe(1);
    expect(service.get("active")).toBe("val3");
  });

  it("automatically sweeps expired items on periodic timer interval", async () => {
    await service.onModuleInit();

    service.set("temp1", "val1", 30);
    service.set("temp2", "val2", 30);

    vi.advanceTimersByTime(31_000);
    expect(service.size).toBe(2); // Still in memory until sweep

    vi.advanceTimersByTime(30_000); // 60s total -> timer fires
    expect(service.size).toBe(0);
  });

  it("returns isolated snapshots instead of shared mutable objects", () => {
    service.set("object", { nested: { value: 1 } }, 60);

    const first = service.get<{ nested: { value: number } }>("object")!;
    first.nested.value = 2;

    expect(service.get("object")).toEqual({ nested: { value: 1 } });
  });

  it("evicts oldest entry when reaching MAX_CACHE_SIZE", () => {
    service.set("first", "first_val", 100);
    for (let i = 1; i < MAX_CACHE_SIZE; i++) {
      service.set(`key_${i}`, i, 100);
    }
    expect(service.size).toBe(MAX_CACHE_SIZE);

    // Adding one more key should evict 'first' (oldest)
    service.set("overflow", "overflow_val", 100);
    expect(service.size).toBe(MAX_CACHE_SIZE);
    expect(service.get("first")).toBeUndefined();
    expect(service.get("overflow")).toBe("overflow_val");
    expect(mockMetrics.recordEvict).toHaveBeenCalledWith("memory");
  });

  it("cleans up timer and subscriber on application shutdown", async () => {
    await service.onModuleInit();
    service.set("a", 1, 60);

    await service.onApplicationShutdown();
    expect(mockSubscriber.quit).toHaveBeenCalled();
    expect(service.size).toBe(0);
  });
});
