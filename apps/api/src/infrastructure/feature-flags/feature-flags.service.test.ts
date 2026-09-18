import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FeatureFlagsService } from "./feature-flags.service";
import type { PinoLoggerService } from "../logger/logger.service";
import type { RedisService } from "../redis/redis.service";
import { env } from "../../config/env";

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
    };

    mockRedisService = {
      getClient: vi.fn().mockReturnValue(mockRedisClient),
    } as unknown as RedisService;

    service = new FeatureFlagsService(mockLogger, mockRedisService);
  });

  afterEach(() => {
    env.FEATURE_FLAGS = "{}";
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
