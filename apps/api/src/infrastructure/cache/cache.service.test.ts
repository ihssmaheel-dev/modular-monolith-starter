import { describe, it, expect, vi, beforeEach } from "vitest";
import { CacheService, MAX_INFLIGHT_CACHE_LOADS } from "./cache.service";
import type { RedisService } from "../redis/redis.service";
import type { CacheMetricsService } from "./cache-metrics.service";
import type { PinoLoggerService } from "../logger/logger.service";

const mockGet = vi.fn();
const mockSetex = vi.fn();
const mockDel = vi.fn();
const mockScan = vi.fn();

vi.mock("../../config/env", () => ({
  env: {
    NODE_ENV: "test",
    REDIS_URL: "redis://localhost:6379",
    S3_ENDPOINT: "localhost",
    S3_REGION: "us-east-1",
    S3_BUCKET: "test",
    S3_ACCESS_KEY_ID: "test",
    S3_SECRET_ACCESS_KEY: "test",
    S3_FORCE_PATH_STYLE: true,
  },
}));

describe("CacheService", () => {
  let service: CacheService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CacheService(
      {
        getClient: () => ({
          get: mockGet,
          setex: mockSetex,
          del: mockDel,
          scan: mockScan,
        }),
      } as unknown as RedisService,
      {
        recordHit: vi.fn(),
        recordMiss: vi.fn(),
        recordSet: vi.fn(),
        recordEvict: vi.fn(),
      } as unknown as CacheMetricsService,
      {
        child: () => ({ info: vi.fn(), debug: vi.fn(), error: vi.fn() }),
      } as unknown as PinoLoggerService,
    );
  });

  it("should return null for cache miss", async () => {
    mockGet.mockResolvedValue(null);
    const result = await service.get("key1");
    expect(result).toBeNull();
  });

  it("should return parsed value for cache hit", async () => {
    mockGet.mockResolvedValue(JSON.stringify({ id: 1, name: "test" }));
    const result = await service.get("key1");
    expect(result).toEqual({ id: 1, name: "test" });
  });

  it("should set value with TTL", async () => {
    await service.set("key1", { id: 1 }, 300);
    expect(mockSetex).toHaveBeenCalledWith("key1", 300, '{"id":1}');
  });

  it("should return cached value from getOrSet", async () => {
    mockGet.mockResolvedValue(JSON.stringify({ id: 1 }));
    const fetcher = vi.fn();
    const result = await service.getOrSet("key1", fetcher, 300);
    expect(result).toEqual({ id: 1 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("should call fetcher on cache miss and store result", async () => {
    mockGet.mockResolvedValue(null);
    mockSetex.mockResolvedValue("OK");
    const fetcher = vi.fn().mockResolvedValue({ id: 2 });
    const result = await service.getOrSet("key1", fetcher, 300);
    expect(result).toEqual({ id: 2 });
    expect(fetcher).toHaveBeenCalled();
    expect(mockSetex).toHaveBeenCalledWith("key1", 300, '{"id":2}');
  });

  it("should delete key", async () => {
    mockDel.mockResolvedValue(1);
    await service.del("key1");
    expect(mockDel).toHaveBeenCalledWith("key1");
  });

  it("allows retry after a fetcher throws before returning its promise", async () => {
    mockGet.mockResolvedValue(null);
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => {
        throw new Error("unavailable");
      })
      .mockResolvedValue("recovered");

    await expect(service.getOrSet("retry", fetcher)).rejects.toThrow("unavailable");
    await expect(service.getOrSet("retry", fetcher)).resolves.toBe("recovered");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("coalesces bounded loads and bypasses tracking for excess unique keys", async () => {
    mockGet.mockResolvedValue(null);
    let resolveLoads!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      resolveLoads = resolve;
    });
    const trackedFetcher = vi.fn(() => pending);
    const loads = Array.from({ length: MAX_INFLIGHT_CACHE_LOADS }, (_, index) =>
      service.getOrSet(`bounded-${index}`, trackedFetcher),
    );
    await vi.waitFor(() => expect(trackedFetcher).toHaveBeenCalledTimes(MAX_INFLIGHT_CACHE_LOADS));
    const duplicate = service.getOrSet("bounded-0", trackedFetcher);
    const overflowFetcher = vi.fn(() => pending);
    const overflow = [
      service.getOrSet("overflow", overflowFetcher),
      service.getOrSet("overflow", overflowFetcher),
    ];
    await vi.waitFor(() => expect(overflowFetcher).toHaveBeenCalledTimes(2));
    expect(trackedFetcher).toHaveBeenCalledTimes(MAX_INFLIGHT_CACHE_LOADS);
    resolveLoads("complete");
    await Promise.all([...loads, duplicate, ...overflow]);
  });

  it("should delete keys by pattern", async () => {
    mockScan.mockResolvedValueOnce(["0", ["key1", "key2"]]);
    mockDel.mockResolvedValue(2);
    await service.delPattern("key*");
    expect(mockScan).toHaveBeenCalledWith("0", "MATCH", "key*", "COUNT", 100);
    expect(mockDel).toHaveBeenCalledWith("key1", "key2");
  });
});
