import { err, ok } from "neverthrow";
import { describe, expect, it, vi } from "vitest";

import { OutboxConsumerRegistry } from "./outbox-consumer.registry";

const EVENT = {
  id: "event-1",
  topic: "user.created",
  version: 1,
  payload: { userId: "user-1" },
};

describe("OutboxConsumerRegistry", () => {
  it("awaits every required consumer", async () => {
    const first = vi.fn().mockResolvedValue(ok(undefined));
    const second = vi.fn().mockResolvedValue(ok(undefined));
    const registry = new OutboxConsumerRegistry();
    registry.register({ id: "users.welcome.v1", topics: ["user.created"], handle: first });
    registry.register({ id: "notifications.welcome.v1", topics: ["user.created"], handle: second });

    await registry.executeRequired(EVENT);

    expect([first.mock.calls.length, second.mock.calls.length]).toEqual([1, 1]);
  });

  it("fails the delivery when a required consumer returns an error", async () => {
    const registry = new OutboxConsumerRegistry();
    registry.register({
      id: "users.welcome.v1",
      topics: ["user.created"],
      handle: vi.fn().mockResolvedValue(err({ type: "QUEUE_UNAVAILABLE" })),
    });

    await expect(registry.executeRequired(EVENT)).rejects.toThrow(
      "DURABLE_CONSUMER_FAILED:users.welcome.v1:QUEUE_UNAVAILABLE",
    );
  });

  it("rejects unclassified durable topics", async () => {
    const registry = new OutboxConsumerRegistry();

    await expect(registry.executeRequired(EVENT)).rejects.toThrow(
      "UNCLASSIFIED_DURABLE_EVENT:user.created",
    );
  });

  it("allows an explicitly classified observer-only topic", async () => {
    const registry = new OutboxConsumerRegistry();
    registry.registerObserverTopics(["user.created"]);

    await expect(registry.executeRequired(EVENT)).resolves.toBeUndefined();
  });

  it("rejects duplicate consumer identities", () => {
    const registry = new OutboxConsumerRegistry();
    const registration = {
      id: "users.welcome.v1",
      topics: ["user.created"],
      handle: vi.fn().mockResolvedValue(ok(undefined)),
    };
    registry.register(registration);

    expect(() => registry.register(registration)).toThrow("Duplicate outbox consumer registration");
  });

  it("turns an unexpected consumer exception into a retryable worker failure", async () => {
    const registry = new OutboxConsumerRegistry();
    registry.register({
      id: "users.welcome.v1",
      topics: ["user.created"],
      handle: vi.fn().mockRejectedValue(new Error("renderer failed")),
    });

    await expect(registry.executeRequired(EVENT)).rejects.toThrow(
      "DURABLE_CONSUMER_THROWN:users.welcome.v1",
    );
  });
});
