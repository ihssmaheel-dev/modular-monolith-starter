import { describe, expect, it, vi } from "vitest";
import { QueueService } from "./queue.service";
import type { PinoLoggerService } from "../logger/logger.service";

describe("QueueService", () => {
  const mockLogger = {
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as PinoLoggerService;

  it("pauses and closes workers before closing queues on shutdown (H22)", async () => {
    const service = new QueueService(mockLogger);
    const order: string[] = [];

    const mockWorker = {
      pause: vi.fn().mockImplementation(async () => {
        order.push("worker-pause");
      }),
      close: vi.fn().mockImplementation(async () => {
        order.push("worker-close");
      }),
    };

    const mockQueue = {
      close: vi.fn().mockImplementation(async () => {
        order.push("queue-close");
      }),
    };

    // Inject into internal maps
    (service as unknown as { workers: Map<string, unknown> }).workers.set("w1", mockWorker);
    (service as unknown as { queues: Map<string, unknown> }).queues.set("q1", mockQueue);

    await service.beforeApplicationShutdown();

    expect(mockWorker.pause).toHaveBeenCalledTimes(1);
    expect(mockWorker.close).toHaveBeenCalledTimes(1);
    expect(mockQueue.close).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["worker-pause", "worker-close", "queue-close"]);
  });
});
