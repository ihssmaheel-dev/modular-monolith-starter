import { describe, expect, it, vi } from "vitest";
import { OutboxEventWorker } from "./outbox-event.worker";
import type { QueueService } from "../queue/queue.service";
import type { EventEmitter2 } from "@nestjs/event-emitter";
import type { PinoLoggerService } from "../logger/logger.service";
import type { TenantContextService } from "../database";
import type { RedisService } from "../redis/redis.service";
import type { DatabaseService } from "../database";
import type { OutboxRepository } from "./outbox.repository";

describe("OutboxEventWorker", () => {
  it("validates and emits durable queue envelopes", async () => {
    let handler: ((job: { data: unknown }) => Promise<void>) | undefined;
    const queues = {
      addWorker: vi.fn((_name, next) => {
        handler = next;
        return {};
      }),
    } as unknown as QueueService;
    const events = { emitAsync: vi.fn().mockResolvedValue([]) } as unknown as EventEmitter2;
    const logger = {
      child: vi.fn().mockReturnThis(),
      debug: vi.fn(),
    } as unknown as PinoLoggerService;
    const worker = new OutboxEventWorker(queues, events, logger);

    worker.onModuleInit();
    await handler?.({
      data: {
        id: "event-1",
        topic: "note.created",
        version: 1,
        payload: { noteId: "note-1", userId: "user-1", title: "Title", content: "Content" },
      },
    });

    expect(events.emitAsync).toHaveBeenCalledWith("note.created", {
      noteId: "note-1",
      userId: "user-1",
      title: "Title",
      content: "Content",
    });
  });

  it("restores tenant scope before invoking consumers", async () => {
    let handler: ((job: { data: unknown; attemptsMade?: number }) => Promise<void>) | undefined;
    const queues = {
      addWorker: vi.fn((_name, next) => {
        handler = next;
        return {};
      }),
    } as unknown as QueueService;
    const events = { emitAsync: vi.fn().mockResolvedValue([]) } as unknown as EventEmitter2;
    const logger = {
      child: vi.fn().mockReturnThis(),
      debug: vi.fn(),
    } as unknown as PinoLoggerService;
    const tenantContext = {
      runSystem: vi.fn(async (_context, callback: () => Promise<unknown[]>) => callback()),
    } as unknown as TenantContextService;
    const worker = new OutboxEventWorker(
      queues,
      events,
      logger,
      undefined,
      undefined,
      tenantContext,
    );

    worker.onModuleInit();
    await handler?.({
      data: {
        id: "event-tenant",
        topic: "note.created",
        version: 1,
        tenantId: "tenant-1",
        payload: { noteId: "note-1", userId: "user-1", title: "Title", content: "Content" },
      },
    });

    expect(tenantContext.runSystem).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1" }),
      expect.any(Function),
    );
  });

  it("deduplicates a retried event after the consumer succeeds", async () => {
    let handler: ((job: { data: unknown }) => Promise<void>) | undefined;
    const queues = {
      addWorker: vi.fn((_name, next) => {
        handler = next;
        return {};
      }),
    } as unknown as QueueService;
    const events = { emitAsync: vi.fn().mockResolvedValue([]) } as unknown as EventEmitter2;
    const client = {
      get: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("completed"),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn(),
    };
    const redis = { getClient: vi.fn().mockReturnValue(client) } as unknown as RedisService;
    const logger = {
      child: vi.fn().mockReturnThis(),
      debug: vi.fn(),
    } as unknown as PinoLoggerService;
    const worker = new OutboxEventWorker(
      queues,
      events,
      logger,
      undefined,
      undefined,
      undefined,
      redis,
    );

    worker.onModuleInit();
    const job = {
      data: {
        id: "event-dedupe",
        topic: "note.created",
        version: 1,
        payload: { noteId: "note-1", userId: "user-1", title: "Title", content: "Content" },
      },
    };
    await handler?.(job);
    await handler?.(job);

    expect(events.emitAsync).toHaveBeenCalledTimes(1);
  });

  it("resets marker, retained job, and row on dead-letter replay (H11)", async () => {
    const removed: string[] = [];
    const queues = {
      addWorker: vi.fn(),
      getQueue: vi.fn().mockReturnValue({
        getJob: vi.fn().mockResolvedValue({ remove: vi.fn(async () => removed.push("event-1")) }),
      }),
    } as unknown as QueueService;
    const events = { emitAsync: vi.fn() } as unknown as EventEmitter2;
    const client = { del: vi.fn().mockResolvedValue(1) };
    const redis = { getClient: vi.fn().mockReturnValue(client) } as unknown as RedisService;
    const repository = {
      requeueDeadLetter: vi.fn().mockResolvedValue(true),
    } as unknown as OutboxRepository;
    const database = {
      withSystemScope: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    } as unknown as DatabaseService;
    const logger = {
      child: vi.fn().mockReturnThis(),
      debug: vi.fn(),
      warn: vi.fn(),
    } as unknown as PinoLoggerService;
    const worker = new OutboxEventWorker(
      queues,
      events,
      logger,
      database,
      repository,
      undefined,
      redis,
    );

    const replayed = await worker.replayDeadLetter("event-1");

    expect(replayed).toBe(true);
    expect(client.del).toHaveBeenCalledWith("outbox:consumer:v1:event-1");
    expect(removed).toEqual(["event-1"]);
    expect(repository.requeueDeadLetter).toHaveBeenCalledWith("event-1");
  });

  it("still requeues when no retained job exists", async () => {
    const queues = {
      addWorker: vi.fn(),
      getQueue: vi.fn().mockReturnValue({ getJob: vi.fn().mockResolvedValue(null) }),
    } as unknown as QueueService;
    const events = { emitAsync: vi.fn() } as unknown as EventEmitter2;
    const redis = {
      getClient: vi.fn().mockReturnValue({ del: vi.fn().mockResolvedValue(0) }),
    } as unknown as RedisService;
    const repository = {
      requeueDeadLetter: vi.fn().mockResolvedValue(true),
    } as unknown as OutboxRepository;
    const database = {
      withSystemScope: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    } as unknown as DatabaseService;
    const logger = {
      child: vi.fn().mockReturnThis(),
      debug: vi.fn(),
      warn: vi.fn(),
    } as unknown as PinoLoggerService;
    const worker = new OutboxEventWorker(
      queues,
      events,
      logger,
      database,
      repository,
      undefined,
      redis,
    );

    await expect(worker.replayDeadLetter("event-1")).resolves.toBe(true);
    expect(repository.requeueDeadLetter).toHaveBeenCalledWith("event-1");
  });

  it("dead-letters a malformed envelope after the final retry", async () => {
    let handler: ((job: { data: unknown; attemptsMade?: number }) => Promise<void>) | undefined;
    const queues = {
      addWorker: vi.fn((_name, next) => {
        handler = next;
        return {};
      }),
    } as unknown as QueueService;
    const events = { emitAsync: vi.fn() } as unknown as EventEmitter2;
    const repository = { updateById: vi.fn().mockResolvedValue({}) } as unknown as OutboxRepository;
    const database = {
      withSystemScope: vi.fn(async (callback: () => Promise<unknown>) => callback()),
      runTransaction: vi.fn(async (callback: () => Promise<unknown>) => callback()),
    } as unknown as DatabaseService;
    const logger = {
      child: vi.fn().mockReturnThis(),
      debug: vi.fn(),
    } as unknown as PinoLoggerService;
    const worker = new OutboxEventWorker(queues, events, logger, database, repository);

    worker.onModuleInit();
    await expect(
      handler?.({
        data: { id: "malformed-event", topic: "note.created", version: 1, payload: {} },
        attemptsMade: 4,
      }),
    ).rejects.toThrow();

    expect(repository.updateById).toHaveBeenCalledWith(
      "malformed-event",
      expect.objectContaining({ status: "DEAD_LETTER" }),
    );
    expect(events.emitAsync).not.toHaveBeenCalled();
  });
});
