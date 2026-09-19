import { describe, expect, it, vi } from "vitest";
import { QueueService } from "./queue.service";
import type { PinoLoggerService } from "../logger/logger.service";

vi.mock("bullmq", () => {
  return {
    Queue: vi.fn().mockImplementation(function () {
      return {
        add: vi.fn(),
        on: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      };
    }),
    Worker: vi.fn().mockImplementation(function () {
      return {
        on: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

describe("QueueService", () => {
  const mockLogger = {
    error: vi.fn(),
    warn: vi.fn(),
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

  it("closes previous worker when registering a new worker for the same queue", () => {
    const service = new QueueService(mockLogger);
    const oldWorker = {
      close: vi.fn().mockResolvedValue(undefined),
    };
    (service as unknown as { workers: Map<string, unknown> }).workers.set("w1", oldWorker);

    service.addWorker("w1", async () => {});

    expect(oldWorker.close).toHaveBeenCalledTimes(1);
  });

  it("does not overlap queue metric polls or fetch a job for an empty queue", async () => {
    let resolveCounts: ((counts: Record<string, number>) => void) | undefined;
    const queue = {
      getJobCounts: vi.fn().mockImplementation(
        () =>
          new Promise<Record<string, number>>((resolve) => {
            resolveCounts = resolve;
          }),
      ),
      getJobs: vi.fn(),
    };
    const metrics = { setGauge: vi.fn() };
    const service = new QueueService(mockLogger, metrics as never);
    (service as unknown as { queues: Map<string, unknown> }).queues.set("email", queue);

    const firstPoll = service.measureQueueHealth();
    await service.measureQueueHealth();
    expect(queue.getJobCounts).toHaveBeenCalledOnce();

    resolveCounts?.({ waiting: 0, active: 0, delayed: 0, failed: 0 });
    await firstPoll;
    expect(queue.getJobs).not.toHaveBeenCalled();
    expect(metrics.setGauge).toHaveBeenCalledTimes(5);
  });
});
