import { describe, expect, it, vi } from "vitest";

import type { PinoLoggerService } from "../../logger/logger.service";
import type { MetricsService } from "../../metrics/metrics.service";
import type { RedisService } from "../../redis/redis.service";
import { RealtimeStreamReaper } from "./realtime-stream.reaper";
import type { RealtimeStreamConsumer } from "./realtime-stream.consumer";

const STREAM_KEY = "realtime:events";

function createReaper(client: Record<string, unknown>) {
  const redis = { getClient: vi.fn().mockReturnValue(client) } as unknown as RedisService;
  const consumer = { groupName: "realtime-dispatchers-own" } as RealtimeStreamConsumer;
  const metrics = { incrementCounter: vi.fn() } as unknown as MetricsService;
  const logger = {
    child: vi.fn().mockReturnValue({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
  } as unknown as PinoLoggerService;
  return new RealtimeStreamReaper(redis, consumer, metrics, logger);
}

function groupInfo(names: string[]) {
  return names.map((name) => ["name", name, "consumers", 0, "pending", 0]);
}

describe("RealtimeStreamReaper", () => {
  it("destroys foreign dispatcher groups without a heartbeat", async () => {
    const client = {
      xinfo: vi
        .fn()
        .mockResolvedValue(
          groupInfo(["realtime-dispatchers-own", "realtime-dispatchers-dead", "other-group"]),
        ),
      get: vi.fn().mockResolvedValue(null),
      xgroup: vi.fn().mockResolvedValue("OK"),
    };
    const reaper = createReaper(client);

    await reaper.reapStaleDispatcherGroups();

    expect(client.xgroup).toHaveBeenCalledWith("DESTROY", STREAM_KEY, "realtime-dispatchers-dead");
    expect(client.xgroup).toHaveBeenCalledTimes(1);
  });

  it("keeps its own group and groups with a live heartbeat", async () => {
    const client = {
      xinfo: vi
        .fn()
        .mockResolvedValue(groupInfo(["realtime-dispatchers-own", "realtime-dispatchers-live"])),
      get: vi.fn().mockImplementation((key: string) => {
        if (key === "realtime:dispatchers:heartbeat:realtime-dispatchers-live") return "alive";
        return null;
      }),
      xgroup: vi.fn().mockResolvedValue("OK"),
    };
    const reaper = createReaper(client);

    await reaper.reapStaleDispatcherGroups();

    expect(client.xgroup).not.toHaveBeenCalled();
  });

  it("stays silent when Redis is unavailable", async () => {
    const redis = { getClient: vi.fn().mockReturnValue(null) } as unknown as RedisService;
    const consumer = { groupName: "realtime-dispatchers-own" } as RealtimeStreamConsumer;
    const metrics = { incrementCounter: vi.fn() } as unknown as MetricsService;
    const logger = {
      child: vi.fn().mockReturnValue({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
    } as unknown as PinoLoggerService;
    const reaper = new RealtimeStreamReaper(redis, consumer, metrics, logger);

    await expect(reaper.reapStaleDispatcherGroups()).resolves.toBeUndefined();
  });

  it("swallows Redis errors instead of failing the cron tick", async () => {
    const logError = vi.fn();
    const client = {
      xinfo: vi.fn().mockRejectedValue(new Error("LOADING dataset in memory")),
    };
    const redis = { getClient: vi.fn().mockReturnValue(client) } as unknown as RedisService;
    const consumer = { groupName: "realtime-dispatchers-own" } as RealtimeStreamConsumer;
    const metrics = { incrementCounter: vi.fn() } as unknown as MetricsService;
    const logger = {
      child: vi.fn().mockReturnValue({ error: logError, warn: vi.fn(), info: vi.fn() }),
    } as unknown as PinoLoggerService;
    const reaper = new RealtimeStreamReaper(redis, consumer, metrics, logger);

    await expect(reaper.reapStaleDispatcherGroups()).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({}),
      "Realtime dispatcher reap failed",
    );
  });
});
