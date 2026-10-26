import { afterEach, describe, expect, it, vi } from "vitest";
import { closeRedisConnection, REDIS_SHUTDOWN_TIMEOUT_MS } from "./close-redis-connection";

describe("closeRedisConnection", () => {
  afterEach(() => vi.useRealTimers());

  it("clears the deadline and disconnects after a successful quit", async () => {
    vi.useFakeTimers();
    const client = { quit: vi.fn().mockResolvedValue("OK"), disconnect: vi.fn() };
    await closeRedisConnection(client);
    expect(client.disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("disconnects a stalled socket at the shutdown deadline", async () => {
    vi.useFakeTimers();
    const client = { quit: vi.fn(() => new Promise<"OK">(() => {})), disconnect: vi.fn() };
    const closing = closeRedisConnection(client);
    const assertion = expect(closing).rejects.toThrow("Redis shutdown deadline exceeded");
    await vi.advanceTimersByTimeAsync(REDIS_SHUTDOWN_TIMEOUT_MS);
    await assertion;
    expect(client.disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("disconnects on failure and preserves its diagnostic", async () => {
    const client = { quit: vi.fn().mockRejectedValue(new Error("offline")), disconnect: vi.fn() };
    await expect(closeRedisConnection(client)).rejects.toThrow("offline");
    expect(client.disconnect).toHaveBeenCalledOnce();
  });
});
