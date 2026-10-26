import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventEmitter } from "node:events";
import { RedisService } from "./redis.service";

interface MockClient extends EventEmitter {
  status: string;
  quit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

const state = vi.hoisted(() => ({ client: undefined as MockClient | undefined }));
vi.mock("../../config/env", () => ({ env: { REDIS_URL: "redis://127.0.0.1:6379" } }));
vi.mock("ioredis", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    default: class extends EventEmitter {
      status = "connecting";
      quit = vi.fn().mockResolvedValue("OK");
      disconnect = vi.fn();
      constructor() {
        super();
        state.client = this;
      }
    },
  };
});

describe("RedisService lifecycle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function createService() {
    const logger = { child: vi.fn().mockReturnThis(), error: vi.fn(), warn: vi.fn() };
    return new RedisService(logger as never);
  }

  it("removes its startup deadline and temporary listener once connected", async () => {
    const service = createService();
    const starting = service.connect();
    const client = state.client!;
    client.status = "ready";
    client.emit("ready");

    await expect(starting).resolves.toBe(client);
    expect(client.listenerCount("ready")).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    await service.onApplicationShutdown();
    expect(client.disconnect).toHaveBeenCalledOnce();
  });

  it("removes its startup listener at timeout while retaining reconnection notifications", async () => {
    const service = createService();
    const listener = vi.fn();
    service.onReady(listener);
    const starting = service.connect();
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(starting).resolves.toBeNull();
    const client = state.client!;
    expect(client.listenerCount("ready")).toBe(1);
    client.status = "ready";
    client.emit("ready");
    expect(listener).toHaveBeenCalledOnce();
    expect(service.getClient()).toBe(client);
    await service.onApplicationShutdown();
  });
});
