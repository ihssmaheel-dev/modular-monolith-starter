import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import { SseConnection } from "./sse-connection";

class FakeResponse extends EventEmitter {
  writableLength = 0;
  writableEnded = false;
  write = vi.fn((_frame: Buffer) => true);
  end = vi.fn(() => {
    this.writableEnded = true;
  });
}

describe("SseConnection", () => {
  it("writes a valid SSE frame", () => {
    const response = new FakeResponse();
    const connection = new SseConnection(response as never, vi.fn());

    expect(connection.send("notification.created", { id: "n-1" })).toBe(true);
    expect(response.write).toHaveBeenCalledWith(
      Buffer.from('event: notification.created\ndata: {"id":"n-1"}\n\n'),
    );
  });

  it("bounds bytes queued behind transport backpressure", () => {
    const response = new FakeResponse();
    response.write.mockReturnValue(false);
    const onClosed = vi.fn();
    const connection = new SseConnection(response as never, onClosed);

    connection.send("event", { data: "x".repeat(8_000) });
    response.writableLength = 8_350;
    connection.send("event", { data: "x".repeat(8_000) });
    expect(connection.send("event", { data: "overflow" })).toBe(false);

    expect(connection.closed).toBe(true);
    expect(onClosed).toHaveBeenCalledWith("backlog_bytes", expect.any(Number));
  });

  it("flushes queued frames only after drain", () => {
    const response = new FakeResponse();
    response.write.mockReturnValueOnce(false).mockReturnValue(true);
    const connection = new SseConnection(response as never, vi.fn());

    connection.send("first", { id: 1 });
    connection.send("second", { id: 2 });
    expect(response.write).toHaveBeenCalledTimes(1);

    response.emit("drain");
    expect(response.write).toHaveBeenCalledTimes(2);
    expect(connection.queuedBytes).toBe(0);
  });

  it("removes listeners and pending state on close", () => {
    const response = new FakeResponse();
    response.write.mockReturnValue(false);
    const connection = new SseConnection(response as never, vi.fn());
    connection.send("first", { id: 1 });

    connection.close();

    expect(response.listenerCount("drain")).toBe(0);
    expect(connection.queuedBytes).toBe(0);
    expect(response.end).toHaveBeenCalledOnce();
  });
});
