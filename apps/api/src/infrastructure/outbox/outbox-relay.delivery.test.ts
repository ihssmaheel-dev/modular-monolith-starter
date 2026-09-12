import { describe, expect, it, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { OutboxRelayDelivery } from "./outbox-relay.delivery";
import type { OutboxEvent, OutboxRepository } from "./outbox.repository";
import type { EventEmitter2 } from "@nestjs/event-emitter";
import type { MetricsService } from "../metrics/metrics.service";
import type { DatabaseService } from "../database";
import type { PinoLoggerService } from "../logger/logger.service";
import type { QueueService } from "../queue/queue.service";

const EVENT: OutboxEvent = {
  id: "event-1",
  topic: "user.created",
  payload: {
    userId: "user-1",
    email: "user@example.test",
    name: "Test User",
    locale: "en",
  },
  status: "PROCESSING",
  attempts: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("OutboxRelayDelivery", () => {
  let delivery: OutboxRelayDelivery;
  let repository: OutboxRepository;
  let queue: { add: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    repository = { updateById: vi.fn().mockResolvedValue(ok({})) } as unknown as OutboxRepository;
    queue = { add: vi.fn().mockResolvedValue({}) };
    const queues = { getQueue: vi.fn().mockReturnValue(queue) } as unknown as QueueService;
    const database = {
      runTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    } as unknown as DatabaseService;
    const logger = {
      child: vi.fn().mockReturnThis(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    } as unknown as PinoLoggerService;
    delivery = new OutboxRelayDelivery(
      repository,
      { emitAsync: vi.fn() } as unknown as EventEmitter2,
      { incrementCounter: vi.fn(), recordHistogram: vi.fn() } as unknown as MetricsService,
      database,
      logger,
      queues,
    );
  });

  it("holds PROCESSING on enqueue instead of marking PUBLISHED (H11)", async () => {
    await delivery.deliver(EVENT);

    expect(queue.add).toHaveBeenCalledWith(
      EVENT.topic,
      expect.objectContaining({ id: "event-1" }),
      expect.objectContaining({ jobId: "event-1" }),
    );
    expect(repository.updateById).toHaveBeenCalledWith(
      EVENT.id,
      expect.objectContaining({ lockedAt: expect.any(Date) }),
    );
    const [, update] = vi.mocked(repository.updateById).mock.calls[0]!;
    expect(update).not.toHaveProperty("status");
  });

  it("marks PUBLISHED only when fan-out completes inline without a queue", async () => {
    const emitter = { emitAsync: vi.fn().mockResolvedValue([]) };
    const logger = {
      child: vi.fn().mockReturnThis(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    } as unknown as PinoLoggerService;
    const database = {
      runTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    } as unknown as DatabaseService;
    const direct = new OutboxRelayDelivery(
      repository,
      emitter as unknown as EventEmitter2,
      { incrementCounter: vi.fn(), recordHistogram: vi.fn() } as unknown as MetricsService,
      database,
      logger,
    );

    await direct.deliver(EVENT);

    expect(emitter.emitAsync).toHaveBeenCalledWith(EVENT.topic, EVENT.payload);
    expect(repository.updateById).toHaveBeenCalledWith(
      EVENT.id,
      expect.objectContaining({ status: "PUBLISHED" }),
    );
  });
});
