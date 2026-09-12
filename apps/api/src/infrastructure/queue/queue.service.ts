import { BeforeApplicationShutdown, Injectable } from "@nestjs/common";
import { context as otelContext, trace } from "@opentelemetry/api";
import { Job, Queue, Worker } from "bullmq";
import { env } from "../../config/env";
import { PinoLoggerService } from "../logger/logger.service";

type SharedQueue = Queue<unknown, unknown, string>;
type SharedWorker = Worker<unknown, unknown, string>;

@Injectable()
export class QueueService implements BeforeApplicationShutdown {
  private queues = new Map<string, SharedQueue>();
  private workers = new Map<string, SharedWorker>();

  constructor(private readonly loggerService: PinoLoggerService) {}

  getQueue<T = unknown>(name: string): Queue<T, unknown, string> | null {
    if (!env.REDIS_URL) return null;
    if (!this.queues.has(name)) {
      const queue = new Queue<unknown, unknown, string>(name, {
        connection: { url: env.REDIS_URL },
      });
      queue.on("error", (error) => {
        this.loggerService.error({ queue: name, error }, "BullMQ queue error");
      });
      this.queues.set(name, queue);
    }
    return this.queues.get(name) as Queue<T, unknown, string>;
  }

  addWorker<T = unknown>(
    name: string,
    handler: (job: Job<T, unknown, string>) => Promise<void>,
  ): Worker<T, unknown, string> | null {
    if (!env.REDIS_URL) return null;
    const worker = new Worker<T, unknown, string>(
      name,
      (job) => this.runWorker(name, job, handler),
      { connection: { url: env.REDIS_URL } },
    );
    worker.on("error", (error) => {
      this.loggerService.error({ queue: name, error }, "BullMQ worker error");
    });
    this.workers.set(name, worker as SharedWorker);
    return worker;
  }

  async beforeApplicationShutdown(): Promise<void> {
    for (const worker of this.workers.values()) {
      try {
        await worker.pause();
        await worker.close();
      } catch (error) {
        this.loggerService.error({ error }, "Error closing BullMQ worker");
      }
    }
    for (const queue of this.queues.values()) {
      try {
        await queue.close();
      } catch (error) {
        this.loggerService.error({ error }, "Error closing BullMQ queue");
      }
    }
  }

  private async runWorker<T>(
    name: string,
    job: Job<T, unknown, string>,
    handler: (job: Job<T, unknown, string>) => Promise<void>,
  ): Promise<void> {
    const tracer = trace.getTracer("queue-worker");
    await otelContext.with(otelContext.active(), () =>
      tracer.startActiveSpan(`Job: ${name}`, async (span) => {
        try {
          await handler(job);
        } catch (error) {
          span.recordException(toError(error));
          throw error;
        } finally {
          span.end();
        }
      }),
    );
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
