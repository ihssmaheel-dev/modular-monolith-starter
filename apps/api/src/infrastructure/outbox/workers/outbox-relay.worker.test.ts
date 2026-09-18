import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventEmitter2 } from "@nestjs/event-emitter";
import type { MetricsService } from "../../metrics/metrics.service";
import type { PinoLoggerService } from "../../logger/logger.service";
import { OutboxRelayWorker } from "./outbox-relay.worker";
import { OutboxRelayDelivery } from "../services/outbox-relay.delivery";
import type { OutboxEvent, OutboxRepository } from "../repositories/outbox.repository";
import type { DatabaseService, TenantContextService } from "../../database";

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
  attempts: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("OutboxRelayWorker", () => {
  let repository: OutboxRepository;
  let emitter: EventEmitter2;
  let metrics: MetricsService;
  let worker: OutboxRelayWorker;
  let delivery: OutboxRelayDelivery;

  beforeEach(() => {
    repository = {
      recoverStaleLocks: vi.fn().mockResolvedValue(0),
      countPendingEvents: vi.fn().mockResolvedValue(1),
      lockPendingEvents: vi.fn().mockResolvedValue([EVENT]),
      updateById: vi.fn(),
    } as unknown as OutboxRepository;
    emitter = { emitAsync: vi.fn().mockResolvedValue([]) } as unknown as EventEmitter2;
    metrics = {
      setGauge: vi.fn(),
      recordHistogram: vi.fn(),
      incrementCounter: vi.fn(),
    } as unknown as MetricsService;
    const logger = {
      child: vi.fn().mockReturnThis(),
      error: vi.fn(),
      warn: vi.fn(),
    } as unknown as PinoLoggerService;
    const tenantContext = {
      runSystem: vi.fn((_context, callback: () => Promise<void>) => callback()),
    } as unknown as TenantContextService;
    const database = {
      runTransaction: vi.fn().mockImplementation(async (callback) => callback()),
    } as unknown as DatabaseService;
    delivery = new OutboxRelayDelivery(repository, emitter, metrics, database, logger);
    worker = new OutboxRelayWorker(repository, metrics, tenantContext, database, delivery, logger);
  });

  it("publishes and marks a locked event complete", async () => {
    await worker.relayEvents();

    expect(emitter.emitAsync).toHaveBeenCalledWith(
      EVENT.topic,
      EVENT.payload,
      expect.objectContaining({ eventId: EVENT.id, topic: EVENT.topic }),
    );
    expect(repository.updateById).toHaveBeenCalledWith(
      EVENT.id,
      expect.objectContaining({ status: "PUBLISHED" }),
    );
    expect(metrics.recordHistogram).toHaveBeenCalled();
  });

  it("returns a failed delivery to the retry queue", async () => {
    vi.mocked(emitter.emitAsync).mockRejectedValue(new Error("listener failed"));

    await worker.relayEvents();

    expect(repository.updateById).toHaveBeenCalledWith(
      EVENT.id,
      expect.objectContaining({
        status: "PENDING",
        attempts: 1,
      }),
    );
  });

  it("does not retry a published event when latency metrics fail", async () => {
    metrics.recordHistogram = vi.fn(() => {
      throw new Error("metrics unavailable");
    });

    await worker.relayEvents();

    expect(repository.updateById).toHaveBeenCalledTimes(1);
    expect(repository.updateById).toHaveBeenCalledWith(
      EVENT.id,
      expect.objectContaining({ status: "PUBLISHED" }),
    );
  });

  it("moves event to DEAD_LETTER status when max attempts are exceeded", async () => {
    const exhaustedEvent: OutboxEvent = { ...EVENT, id: "event-exhausted", attempts: 4 };
    vi.mocked(repository.lockPendingEvents).mockResolvedValueOnce([exhaustedEvent]);
    vi.mocked(emitter.emitAsync).mockRejectedValue(new Error("permanent error"));
    metrics.incrementCounter = vi.fn();

    await worker.relayEvents();

    expect(repository.updateById).toHaveBeenCalledWith(
      exhaustedEvent.id,
      expect.objectContaining({
        status: "DEAD_LETTER",
        attempts: 5,
        nextAttemptAt: null,
      }),
    );
    expect(metrics.incrementCounter).toHaveBeenCalledWith(
      "outbox_dead_letter_total",
      expect.any(String),
      1,
      { topic: exhaustedEvent.topic },
    );
  });
});
