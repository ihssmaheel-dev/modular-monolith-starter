import { describe, expect, it, vi } from "vitest";
import type { Redis } from "ioredis";

import type { PinoLoggerService } from "../../logger/logger.service";
import type { MetricsService } from "../../metrics/metrics.service";
import type { RedisService } from "../../redis/redis.service";
import { RealtimeStreamConsumer } from "./realtime-stream.consumer";
import type { RealtimeStreamRouter } from "./realtime-stream.router";

describe("RealtimeStreamConsumer", () => {
  it("disables stream consumption gracefully when Redis is unavailable", async () => {
    const logWarn = vi.fn();
    const logger = {
      child: vi.fn().mockReturnValue({ warn: logWarn }),
    } as unknown as PinoLoggerService;
    const redis = { getClient: vi.fn().mockReturnValue(null) } as unknown as RedisService;
    const router = {} as RealtimeStreamRouter;
    const metrics = {} as MetricsService;
    const consumer = new RealtimeStreamConsumer(redis, router, metrics, logger);

    await consumer.onModuleInit();

    expect(logWarn).toHaveBeenCalledWith(
      {},
      "Redis client not available, stream realtime features disabled",
    );
  });

  it("routes stream events locally and records their consumer lag", async () => {
    const xread = vi
      .fn()
      .mockResolvedValueOnce([
        [
          "realtime:events",
          [
            [
              "1000-0",
              [
                "target",
                "tenant:tenant-1:user:user-1",
                "event",
                "note.created",
                "payload",
                '{"id":"note-1"}',
              ],
            ],
          ],
        ],
      ])
      .mockImplementation(() => new Promise<never>(() => undefined));
    const subscriber = { xread, quit: vi.fn().mockResolvedValue("OK") } as unknown as Redis;
    const client = { duplicate: vi.fn().mockReturnValue(subscriber) } as unknown as Redis;
    const redis = { getClient: vi.fn().mockReturnValue(client) } as unknown as RedisService;
    const router = { route: vi.fn().mockReturnValue(true) } as unknown as RealtimeStreamRouter;
    const metrics = { recordHistogram: vi.fn() } as unknown as MetricsService;
    const logger = {
      child: vi.fn().mockReturnValue({ error: vi.fn(), warn: vi.fn() }),
    } as unknown as PinoLoggerService;
    const consumer = new RealtimeStreamConsumer(redis, router, metrics, logger);

    await consumer.onModuleInit();
    await vi.waitFor(() => {
      expect(router.route).toHaveBeenCalledWith("tenant:tenant-1:user:user-1", "note.created", {
        id: "note-1",
      });
    });
    await consumer.onModuleDestroy();

    expect(metrics.recordHistogram).toHaveBeenCalledWith(
      "realtime_consumer_lag_ms",
      "Lag between event generation and stream consumption",
      expect.any(Number),
    );
    expect(subscriber.quit).toHaveBeenCalledOnce();
  });

  function createConsumer(subscriber: Record<string, unknown>) {
    const client = { duplicate: vi.fn().mockReturnValue(subscriber) } as unknown as Redis;
    const redis = { getClient: vi.fn().mockReturnValue(client) } as unknown as RedisService;
    const router = { route: vi.fn().mockReturnValue(true) } as unknown as RealtimeStreamRouter;
    const metrics = {
      recordHistogram: vi.fn(),
      incrementCounter: vi.fn(),
    } as unknown as MetricsService;
    const logger = {
      child: vi.fn().mockReturnValue({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
    } as unknown as PinoLoggerService;
    return new RealtimeStreamConsumer(redis, router, metrics, logger);
  }

  type SubscriberMocks = Record<string, ReturnType<typeof vi.fn>>;

  function hangingSubscriber(overrides: SubscriberMocks = {}): SubscriberMocks {
    return {
      xgroup: vi.fn().mockResolvedValue("OK"),
      xreadgroup: vi.fn().mockImplementation(() => new Promise<never>(() => undefined)),
      xack: vi.fn().mockResolvedValue(1),
      setex: vi.fn().mockResolvedValue("OK"),
      quit: vi.fn().mockResolvedValue("OK"),
      ...overrides,
    };
  }

  it("creates a unique per-instance consumer group for fan-out", async () => {
    const first = hangingSubscriber();
    const second = hangingSubscriber();
    const firstConsumer = createConsumer(first);
    const secondConsumer = createConsumer(second);

    await firstConsumer.onModuleInit();
    await secondConsumer.onModuleInit();

    const firstGroup = first.xgroup?.mock.calls[0]?.[2];
    const secondGroup = second.xgroup?.mock.calls[0]?.[2];
    expect(firstGroup).toMatch(/^realtime-dispatchers-api-/);
    expect(secondGroup).toMatch(/^realtime-dispatchers-api-/);
    expect(firstGroup).not.toBe(secondGroup);
    await firstConsumer.onModuleDestroy();
    await secondConsumer.onModuleDestroy();
  });

  it("beats a liveness heartbeat for the reaper", async () => {
    const subscriber = hangingSubscriber();
    const consumer = createConsumer(subscriber);

    await consumer.onModuleInit();
    await vi.waitFor(() => {
      expect(subscriber.setex).toHaveBeenCalledWith(
        expect.stringMatching(/^realtime:dispatchers:heartbeat:realtime-dispatchers-api-/),
        90,
        "alive",
      );
    });
    await consumer.onModuleDestroy();
  });

  it("recreates its group when Redis reports NOGROUP", async () => {
    const subscriber = hangingSubscriber({
      xreadgroup: vi
        .fn()
        .mockRejectedValueOnce(new Error("NOGROUP No such key 'realtime:events'"))
        .mockImplementation(() => new Promise<never>(() => undefined)),
    });
    const consumer = createConsumer(subscriber);

    await consumer.onModuleInit();
    await vi.waitFor(() => {
      expect(subscriber.xgroup?.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    await consumer.onModuleDestroy();
  });

  it("scopes dead-letter attempt budgets per dispatcher group", async () => {
    const subscriber = hangingSubscriber({
      xreadgroup: vi
        .fn()
        .mockResolvedValueOnce([["realtime:events", [["2000-0", ["target", "user:user-1"]]]]])
        .mockImplementation(() => new Promise<never>(() => undefined)),
      incr: vi.fn().mockResolvedValue(5),
      expire: vi.fn().mockResolvedValue(1),
      xadd: vi.fn().mockResolvedValue("2000-1"),
      del: vi.fn().mockResolvedValue(1),
    });
    const consumer = createConsumer(subscriber);

    await consumer.onModuleInit();
    await vi.waitFor(() => {
      expect(subscriber.xadd).toHaveBeenCalledWith(
        "realtime:events:dead-letter",
        "*",
        "sourceId",
        "2000-0",
        "fields",
        expect.any(String),
      );
    });
    expect(subscriber.incr).toHaveBeenCalledWith(
      `realtime:events:attempts:${consumer.groupName}:2000-0`,
    );
    await consumer.onModuleDestroy();
  });
});
