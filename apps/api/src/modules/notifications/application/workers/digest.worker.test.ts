import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { DigestWorker } from "./digest.worker";
import type { BatchesRepository } from "../../infrastructure/repositories/batches.repository";
import type { NotificationsRepository } from "../../infrastructure/repositories/notifications.repository";
import type { RealtimeService } from "../../../../infrastructure/realtime/realtime.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";

describe("DigestWorker", () => {
  let worker: DigestWorker;
  let batches: BatchesRepository;
  let notifications: NotificationsRepository;

  const window = {
    id: "batch-1",
    userId: "user-1",
    tenantId: null,
    type: "note.activity",
    groupingKey: "user-1:note.activity:none",
    items: [{ titleKey: "x" }],
    status: "open",
    windowEndsAt: new Date(),
  };

  function build(overrides: Record<string, unknown> = {}) {
    let transactionActive = false;
    const outboxDispatchScopes: boolean[] = [];
    batches = {
      findDueWindows: vi.fn().mockResolvedValue([window]),
      lockDueWindow: vi.fn().mockResolvedValue(window),
      updateOne: vi.fn().mockResolvedValue(ok(window)),
      ...overrides,
    } as never;
    notifications = {
      create: vi.fn().mockResolvedValue(ok({ id: "notif-1" })),
      findDigestByBatchId: vi.fn().mockResolvedValue(ok(null)),
      updateById: vi.fn().mockResolvedValue(ok({ id: "notif-1" })),
    } as never;
    const deliveryIntents = {
      createForNotification: vi.fn().mockResolvedValue(undefined),
    } as never;
    const preferences = { findByUser: vi.fn().mockResolvedValue(ok([])) } as never;
    const realtime = { sendToUser: vi.fn() } as unknown as RealtimeService;
    const outbox = {
      dispatchGlobal: vi.fn().mockImplementation(async () => {
        outboxDispatchScopes.push(transactionActive);
        return ok(undefined);
      }),
    } as never;
    const events = { emitAsync: vi.fn().mockResolvedValue([]) } as never;
    const tenantContext = {
      runSystem: vi.fn(
        async (_ctx: unknown, fn: () => unknown) => await (fn as () => Promise<unknown>)(),
      ),
    } as never;
    const database = {
      runTransaction: vi.fn(async (fn: () => unknown) => await (fn as () => Promise<unknown>)()),
      withResultTransaction: vi.fn(async (fn: () => unknown) => {
        transactionActive = true;
        try {
          return await (fn as () => Promise<unknown>)();
        } finally {
          transactionActive = false;
        }
      }),
      emitAfterCommit: vi.fn(async (emitter: unknown, event: string, payload: unknown) => {
        await (emitter as { emitAsync: (e: string, p: unknown) => Promise<unknown> }).emitAsync(
          event,
          payload,
        );
      }),
    } as never;
    const metrics = { incrementCounter: vi.fn() } as never;
    const logger = {
      child: vi.fn().mockReturnThis(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as never;
    worker = new DigestWorker(
      batches,
      notifications,
      deliveryIntents,
      preferences,
      realtime,
      outbox,
      events,
      tenantContext,
      database,
      metrics,
      logger as PinoLoggerService,
    );
    return {
      realtime,
      notifications: notifications as NotificationsRepository,
      outboxDispatchScopes,
    };
  }

  beforeEach(() => {
    vi.stubEnv("PROCESS_ROLE", "worker");
  });

  it("should claim due windows and create one digest row", async () => {
    const { realtime, notifications: repo } = build();

    const result = await worker.closeDueWindows();

    expect(result.delivered).toBe(1);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", type: "note.activity" }),
    );
    expect(realtime.sendToUser).toHaveBeenCalledWith(
      "user-1",
      "notification.created",
      expect.objectContaining({ type: "note.activity" }),
      undefined,
    );
  });

  it("records confirmed digest channels on the digest row (H12)", async () => {
    const { notifications: repo } = build();

    await worker.closeDueWindows();

    expect(repo.updateById).toHaveBeenCalledWith("notif-1", {
      deliveredChannels: ["inApp"],
    });
  });

  it("writes the durable event inside the digest transaction", async () => {
    const built = build();

    await worker.closeDueWindows();

    expect(built.outboxDispatchScopes).toEqual([true]);
  });

  it("should skip a window locked by another replica", async () => {
    const built = build({ lockDueWindow: vi.fn().mockResolvedValue(null) });

    const result = await worker.closeDueWindows();

    expect(result.delivered).toBe(0);
    expect(built.notifications.create).not.toHaveBeenCalled();
  });

  it("should close empty windows without counting a delivery", async () => {
    build({
      lockDueWindow: vi.fn().mockResolvedValue({ ...window, items: [] }),
    });

    const result = await worker.closeDueWindows();

    expect(result.delivered).toBe(0);
  });

  it("should skip work when a digest row already exists for the batch", async () => {
    const built = build();
    const repo = built.notifications;
    const findDigest = vi.fn().mockResolvedValue(ok({ id: "notif-0" }));
    (repo as unknown as { findDigestByBatchId: unknown }).findDigestByBatchId = findDigest;
    const create = vi.fn();
    (repo as unknown as { create: unknown }).create = create;

    const result = await worker.closeDueWindows();

    expect(result.delivered).toBe(0);
    expect(create).not.toHaveBeenCalled();
  });
});
