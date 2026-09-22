import { Injectable } from "@nestjs/common";

import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { FILE_SCAN_QUEUE } from "../../../../infrastructure/queue/queue.constants";
import { QueueService } from "../../../../infrastructure/queue/queue.service";

export const FILE_SCAN_JOB = "scan-file";

const ENQUEUE_TIMEOUT_MS = 1_000;

export interface FileScanJobData {
  fileId: string;
  availableAt: number;
}

/**
 * BullMQ provides the low-latency wake-up; the database row remains the
 * durable source of truth and the minute cron recovers missed wake-ups.
 */
@Injectable()
export class FileScanQueue {
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly queues: QueueService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "FileScanQueue" });
  }

  async enqueue(fileId: string, delayMs = 0): Promise<void> {
    const queue = this.queues.getQueue<FileScanJobData>(FILE_SCAN_QUEUE);
    if (!queue) return;

    const availableAt = Date.now() + delayMs;
    try {
      await settleWithin(
        queue.add(
          FILE_SCAN_JOB,
          { fileId, availableAt },
          {
            delay: delayMs,
            // Wake-up jobs are disposable. Durable retry state lives in
            // Postgres and is recovered by FileScanWorker's safety cron.
            removeOnComplete: true,
            removeOnFail: true,
          },
        ),
        ENQUEUE_TIMEOUT_MS,
      );
    } catch (error) {
      this.logger.warn({ fileId, err: error }, "Immediate file scan enqueue failed");
    }
  }
}

async function settleWithin<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("FILE_SCAN_ENQUEUE_TIMEOUT")), timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
