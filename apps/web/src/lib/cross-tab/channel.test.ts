import { describe, expect, it, vi, afterEach } from "vitest";
import { canUseBroadcast, createBroadcastChannel } from "./channel";

interface Ping {
  type: string;
  n: number;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("broadcast channel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("delivers messages between two handles on the same name", async () => {
    const sender = createBroadcastChannel<Ping>("test-delivery");
    const receiver = createBroadcastChannel<Ping>("test-delivery");
    const seen: Ping[] = [];
    const unsubscribe = receiver.subscribe((message) => {
      seen.push(message);
    });

    sender.post({ type: "ping", n: 1 });
    await vi.waitFor(() => expect(seen).toEqual([{ type: "ping", n: 1 }]));

    unsubscribe();
    sender.close();
    receiver.close();
  });

  it("stops delivery after unsubscribe", async () => {
    const sender = createBroadcastChannel<Ping>("test-unsub");
    const receiver = createBroadcastChannel<Ping>("test-unsub");
    const seen: Ping[] = [];
    const unsubscribe = receiver.subscribe((message) => {
      seen.push(message);
    });

    sender.post({ type: "ping", n: 1 });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    unsubscribe();
    sender.post({ type: "ping", n: 2 });
    await flush();

    expect(seen).toHaveLength(1);
    sender.close();
    receiver.close();
  });

  it("ignores malformed messages", async () => {
    const sender = createBroadcastChannel<Ping>("test-malformed");
    const receiver = createBroadcastChannel<Ping>("test-malformed");
    const seen: Ping[] = [];
    const unsubscribe = receiver.subscribe((message) => {
      seen.push(message);
    });

    sender.post("junk" as never);
    sender.post({ type: "ping", n: 1 });
    await vi.waitFor(() => expect(seen).toEqual([{ type: "ping", n: 1 }]));

    unsubscribe();
    sender.close();
    receiver.close();
  });

  it("returns a no-op handle without BroadcastChannel", () => {
    vi.stubGlobal("BroadcastChannel", undefined);

    expect(canUseBroadcast()).toBe(false);
    const handle = createBroadcastChannel<Ping>("test-ssr");
    expect(() => {
      handle.post({ type: "ping", n: 1 });
      handle.subscribe(() => undefined);
      handle.close();
    }).not.toThrow();
  });
});
