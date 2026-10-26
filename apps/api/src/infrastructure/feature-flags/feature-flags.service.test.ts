import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FeatureFlagsService } from "./feature-flags.service";
import type { PinoLoggerService } from "../logger/logger.service";
import type { RedisService } from "../redis/redis.service";
import { env } from "../../config/env";
import { REDIS_SHUTDOWN_TIMEOUT_MS } from "../redis/close-redis-connection";

vi.mock("ioredis", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      subscribe: vi.fn().mockResolvedValue("OK"),
      quit: vi.fn().mockResolvedValue("OK"),
    })),
  };
});

describe("FeatureFlagsService", () => {
  let service: FeatureFlagsService;
  let mockLogger: PinoLoggerService;
  let mockRedisClient: {
    hgetall: ReturnType<typeof vi.fn>;
    hset: ReturnType<typeof vi.fn>;
    hdel: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    duplicate: ReturnType<typeof vi.fn>;
  };
  let mockRedisService: RedisService;

  beforeEach(() => {
    mockLogger = {
      child: vi.fn().mockReturnThis(),
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as PinoLoggerService;

    mockRedisClient = {
      hgetall: vi.fn().mockResolvedValue({}),
      hset: vi.fn().mockResolvedValue(1),
      hdel: vi.fn().mockResolvedValue(1),
      publish: vi.fn().mockResolvedValue(1),
      duplicate: vi.fn().mockImplementation(() => ({
        on: vi.fn(),
        subscribe: vi.fn().mockResolvedValue("OK"),
        quit: vi.fn().mockResolvedValue("OK"),
        disconnect: vi.fn(),
      })),
    };

    mockRedisService = {
      getClient: vi.fn().mockReturnValue(mockRedisClient),
      onReady: vi.fn().mockReturnValue(vi.fn()),
    } as unknown as RedisService;

    service = new FeatureFlagsService(mockLogger, mockRedisService);
  });

  afterEach(async () => {
    await service.onApplicationShutdown();
    env.FEATURE_FLAGS = "{}";
    vi.useRealTimers();
  });

  it("returns false for unknown flags by default", () => {
    expect(service.isEnabled("unknown_feature")).toBe(false);
  });

  it("respects in-memory overrides", async () => {
    await service.setFlag("beta_dashboard", true);
    expect(service.isEnabled("beta_dashboard")).toBe(true);

    await service.setFlag("beta_dashboard", false);
    expect(service.isEnabled("beta_dashboard")).toBe(false);
  });

  it("reads from validated environment configuration when no override exists", () => {
    env.FEATURE_FLAGS = JSON.stringify({ "test-flag": true });
    expect(service.isEnabled("test-flag")).toBe(true);

    env.FEATURE_FLAGS = JSON.stringify({ "test-flag": false });
    expect(service.isEnabled("test-flag")).toBe(false);
  });

  it("persists to Redis and publishes broadcast on setFlag", async () => {
    await service.setFlag("distributed_mode", true);
    expect(mockRedisClient.hset).toHaveBeenCalledWith(
      "feature_flags:overrides",
      "distributed_mode",
      "1",
    );
    expect(mockRedisClient.publish).toHaveBeenCalledWith(
      "feature_flags:updates",
      JSON.stringify({ type: "set", flagKey: "distributed_mode", enabled: true }),
    );
  });

  it("deletes from Redis and publishes broadcast on deleteFlag", async () => {
    await service.setFlag("temp_flag", true);
    await service.deleteFlag("temp_flag");

    expect(mockRedisClient.hdel).toHaveBeenCalledWith("feature_flags:overrides", "temp_flag");
    expect(mockRedisClient.publish).toHaveBeenCalledWith(
      "feature_flags:updates",
      JSON.stringify({ type: "delete", flagKey: "temp_flag" }),
    );
    expect(service.isEnabled("temp_flag")).toBe(false);
  });

  it("loads initial flags from Redis on init", async () => {
    mockRedisClient.hgetall.mockResolvedValueOnce({
      persisted_flag: "1",
      disabled_flag: "0",
    });

    await service.onModuleInit();
    expect(service.isEnabled("persisted_flag")).toBe(true);
    expect(service.isEnabled("disabled_flag")).toBe(false);
  });

  it("disconnects a stalled subscriber without blocking application shutdown", async () => {
    vi.useFakeTimers();
    const subscriber = {
      on: vi.fn(),
      subscribe: vi.fn().mockResolvedValue("OK"),
      quit: vi.fn(() => new Promise<"OK">(() => {})),
      disconnect: vi.fn(),
    };
    mockRedisClient.duplicate.mockReturnValue(subscriber);
    await service.onModuleInit();

    const closing = service.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(REDIS_SHUTDOWN_TIMEOUT_MS);
    await closing;
    expect(subscriber.disconnect).toHaveBeenCalledOnce();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      "Feature flag subscriber did not quit cleanly",
    );
  });

  it("does not create a subscriber when shutdown begins during initial flag loading", async () => {
    let resolveFlags!: (flags: Record<string, string>) => void;
    mockRedisClient.hgetall.mockImplementationOnce(
      () =>
        new Promise<Record<string, string>>((resolve) => {
          resolveFlags = resolve;
        }),
    );
    const starting = service.onModuleInit();
    await service.onApplicationShutdown();
    resolveFlags({});
    await starting;
    expect(mockRedisClient.duplicate).not.toHaveBeenCalled();
    expect(mockRedisService.onReady).not.toHaveBeenCalled();
  });

  it("handles pub/sub update events dynamically", () => {
    // Simulate incoming pub/sub message on instance B
    const handler = (service as unknown as { handleMessage: (msg: string) => void }).handleMessage;

    handler.call(service, JSON.stringify({ type: "set", flagKey: "sync_flag", enabled: true }));
    expect(service.isEnabled("sync_flag")).toBe(true);

    handler.call(service, JSON.stringify({ type: "delete", flagKey: "sync_flag" }));
    expect(service.isEnabled("sync_flag")).toBe(false);
  });

  it("reconciles deleted overrides on reload by clearing stale memory state", async () => {
    mockRedisClient.hgetall.mockResolvedValueOnce({
      obsolete_flag: "1",
    });

    await service.onModuleInit();
    expect(service.isEnabled("obsolete_flag")).toBe(true);

    // Now Redis returns an empty hash (override was removed in Redis)
    mockRedisClient.hgetall.mockResolvedValueOnce({});
    const loadInitialFlags = (service as unknown as { loadInitialFlags: () => Promise<void> })
      .loadInitialFlags;
    await loadInitialFlags.call(service);

    expect(service.isEnabled("obsolete_flag")).toBe(false);
  });
});
