import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { FILE_SCAN_QUEUE } from "../../../../infrastructure/queue/queue.constants";
import type { QueueService } from "../../../../infrastructure/queue/queue.service";
import { FILE_SCAN_JOB, FileScanQueue } from "./file-scan.queue";

describe("FileScanQueue", () => {
  let add: ReturnType<typeof vi.fn>;
  let queues: QueueService;
  let logger: PinoLoggerService;

  beforeEach(() => {
    add = vi.fn().mockResolvedValue({ id: "job-1" });
    queues = {
      getQueue: vi.fn().mockReturnValue({ add }),
    } as unknown as QueueService;
    logger = {
      child: vi.fn().mockReturnThis(),
      warn: vi.fn(),
    } as unknown as PinoLoggerService;
  });

  it("enqueues an immediate disposable wake-up job", async () => {
    await new FileScanQueue(queues, logger).enqueue("file-1");

    expect(queues.getQueue).toHaveBeenCalledWith(FILE_SCAN_QUEUE);
    expect(add).toHaveBeenCalledWith(
      FILE_SCAN_JOB,
      expect.objectContaining({ fileId: "file-1", availableAt: expect.any(Number) }),
      { delay: 0, removeOnComplete: true, removeOnFail: true },
    );
  });

  it("keeps confirmation successful when Redis enqueue fails", async () => {
    add.mockRejectedValue(new Error("redis unavailable"));

    await expect(new FileScanQueue(queues, logger).enqueue("file-1")).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "file-1" }),
      "Immediate file scan enqueue failed",
    );
  });
});
