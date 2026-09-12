import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PinoLoggerService } from "../logger/logger.service";
import type { RedisService } from "../redis/redis.service";
import type { RealtimeConnectionRegistry } from "./connections/realtime-connection.registry";
import { RealtimeService } from "./realtime.service";

const STREAM_KEY = "realtime:events";
const MAX_STREAM_LENGTH = 10000;

describe("RealtimeService", () => {
  const xadd = vi.fn();
  const logError = vi.fn();
  let registry: RealtimeConnectionRegistry;
  let service: RealtimeService;

  beforeEach(() => {
    vi.clearAllMocks();
    xadd.mockResolvedValue("1-0");
    registry = {
      getUserCount: vi.fn().mockReturnValue(3),
    } as unknown as RealtimeConnectionRegistry;
    const redis = { getClient: vi.fn().mockReturnValue({ xadd }) } as unknown as RedisService;
    const logger = {
      child: vi.fn().mockReturnValue({ error: logError }),
    } as unknown as PinoLoggerService;
    service = new RealtimeService(redis, registry, logger);
  });

  it("publishes tenant-scoped user events to the shared stream", () => {
    service.sendToUser("user-1", "note.created", { id: "note-1" }, "tenant-1");

    expect(xadd).toHaveBeenCalledWith(
      STREAM_KEY,
      "MAXLEN",
      "~",
      MAX_STREAM_LENGTH,
      "*",
      "target",
      "tenant:tenant-1:user:user-1",
      "event",
      "note.created",
      "payload",
      JSON.stringify({ id: "note-1" }),
    );
  });

  it("does not publish when Redis is unavailable", () => {
    const redis = { getClient: vi.fn().mockReturnValue(null) } as unknown as RedisService;
    const logger = {
      child: vi.fn().mockReturnValue({ error: logError }),
    } as unknown as PinoLoggerService;
    service = new RealtimeService(redis, registry, logger);

    service.broadcast("system.ready", { ready: true });

    expect(xadd).not.toHaveBeenCalled();
  });

  it("logs stream publishing failures without interrupting the caller", async () => {
    const error = new Error("Redis unavailable");
    xadd.mockRejectedValue(error);

    service.broadcast("system.ready", { ready: true });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(logError).toHaveBeenCalledWith(
      { err: error, target: "broadcast", event: "system.ready" },
      "Failed to publish to stream",
    );
  });

  it("returns the active connection owner count from the registry", () => {
    expect(service.getUserCount()).toBe(3);
  });

  it("subscribes tenant connections to the user-global key as well (H16)", () => {
    const socket = { readyState: 1 } as never;
    const subject = { next: vi.fn() } as never;
    const scoped = {
      addWsClient: vi.fn(),
      addWsAlias: vi.fn(),
      removeWsClient: vi.fn(),
      removeWsAlias: vi.fn(),
      addSseClient: vi.fn(),
      addSseAlias: vi.fn(),
      removeSseClient: vi.fn(),
      removeSseAlias: vi.fn(),
    } as unknown as RealtimeConnectionRegistry;
    const redis = { getClient: vi.fn().mockReturnValue({ xadd }) } as unknown as RedisService;
    const logger = {
      child: vi.fn().mockReturnValue({ error: logError }),
    } as unknown as PinoLoggerService;
    const scopedService = new RealtimeService(redis, scoped, logger);

    scopedService.addWsClient("user-1", "tenant-1", socket);
    scopedService.addSseClient("user-1", "tenant-1", subject);
    scopedService.addWsClient("user-1", undefined, socket);

    expect(scoped.addWsClient).toHaveBeenCalledTimes(2);
    expect(scoped.addWsAlias).toHaveBeenCalledTimes(1);
    expect(scoped.addSseClient).toHaveBeenCalledTimes(1);
    expect(scoped.addSseAlias).toHaveBeenCalledTimes(1);

    scopedService.removeWsClient("user-1", "tenant-1", socket);
    scopedService.removeSseClient("user-1", "tenant-1", subject);

    expect(scoped.removeWsAlias).toHaveBeenCalledTimes(1);
    expect(scoped.removeSseAlias).toHaveBeenCalledTimes(1);
  });
});
