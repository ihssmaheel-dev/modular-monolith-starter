import { BeforeApplicationShutdown, Injectable, Optional } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { context as otelContext, propagation, trace, type Context } from "@opentelemetry/api";
import { Job, Queue, Worker, type JobsOptions } from "bullmq";
import { env } from "../../config/env";
import { PinoLoggerService } from "../logger/logger.service";
import { MetricsService } from "../metrics/metrics.service";

type SharedQueue = Queue<unknown, unknown, string>;
type SharedWorker = Worker<unknown, unknown, string>;

const QUEUE_METRICS_INTERVAL_MS = 15_000;
const QUEUE_SHUTDOWN_TIMEOUT_MS = 5_000;
const TRACE_CONTEXT_FIELD = "__traceContext";
const MAX_TRACE_METADATA_LENGTH = 1_024;
type TraceCarrier = Record<string, string>;

@Injectable()
export class QueueService implements BeforeApplicationShutdown {
  private queues = new Map<string, SharedQueue>();
  private workers = new Map<string, SharedWorker>();
  private measuringQueueHealth = false;

  constructor(
    private readonly loggerService: PinoLoggerService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  getQueue<T = unknown>(name: string): Queue<T, unknown, string> | null {
    if (!env.REDIS_URL) return null;
    if (!this.queues.has(name)) {
      const queue = new Queue<unknown, unknown, string>(name, {
        connection: { url: env.REDIS_URL },
        defaultJobOptions: {
          removeOnComplete: { count: 500, age: 86_400 },
          removeOnFail: { count: 1_000, age: 604_800 },
        },
      });
      queue.on("error", (error) => {
        this.loggerService.error({ queue: name, err: error }, "BullMQ queue error");
        this.metricsService?.incrementCounter(
          "bullmq_queue_errors_total",
          "BullMQ queue errors",
          1,
          { queue: name },
        );
      });
      this.instrumentQueue(queue);
      this.queues.set(name, queue);
    }
    return this.queues.get(name) as Queue<T, unknown, string>;
  }

  getRegisteredQueues(): SharedQueue[] {
    return Array.from(this.queues.values());
  }

  addWorker<T = unknown>(
    name: string,
    handler: (job: Job<T, unknown, string>) => Promise<void>,
  ): Worker<T, unknown, string> | null {
    if (!env.REDIS_URL) return null;
    this.getQueue(name);
    const worker = new Worker<T, unknown, string>(
      name,
      (job) => this.runWorker(name, job, handler),
      { connection: { url: env.REDIS_URL } },
    );
    worker.on("error", (error) => {
      this.loggerService.error({ queue: name, err: error }, "BullMQ worker error");
      this.metricsService?.incrementCounter(
        "bullmq_worker_errors_total",
        "BullMQ worker errors",
        1,
        { queue: name },
      );
    });
    worker.on("stalled", (jobId) => {
      this.loggerService.warn({ queue: name, jobId }, "BullMQ job stalled");
      this.metricsService?.incrementCounter(
        "bullmq_stalled_jobs_total",
        "BullMQ stalled jobs count",
        1,
        { queue: name },
      );
    });
    worker.on("failed", (_job, _error) => {
      this.metricsService?.incrementCounter(
        "bullmq_job_failures_total",
        "BullMQ job failures count",
        1,
        { queue: name },
      );
    });
    this.workers.set(name, worker as SharedWorker);
    return worker;
  }

  async beforeApplicationShutdown(): Promise<void> {
    const deadline = Date.now() + QUEUE_SHUTDOWN_TIMEOUT_MS;
    for (const worker of this.workers.values()) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        this.loggerService.warn({}, "Queue shutdown deadline reached before all workers closed");
        break;
      }
      try {
        await settleWithin(worker.pause(), remaining);
        await settleWithin(worker.close(), Math.max(1, deadline - Date.now()));
      } catch (error) {
        this.loggerService.error({ err: error }, "Error closing BullMQ worker");
      }
    }
    for (const queue of this.queues.values()) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        this.loggerService.warn({}, "Queue shutdown deadline reached before all queues closed");
        break;
      }
      try {
        await settleWithin(queue.close(), remaining);
      } catch (error) {
        this.loggerService.error({ err: error }, "Error closing BullMQ queue");
      }
    }
  }

  @Interval(QUEUE_METRICS_INTERVAL_MS)
  async measureQueueHealth(): Promise<void> {
    if (!this.metricsService || this.measuringQueueHealth) return;
    this.measuringQueueHealth = true;
    try {
      for (const [name, queue] of this.queues) {
        try {
          const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed");
          const [oldest] = (counts.waiting ?? 0) > 0 ? await queue.getJobs(["waiting"], 0, 0) : [];
          const oldestAgeSeconds = oldest ? Math.max(0, (Date.now() - oldest.timestamp) / 1000) : 0;
          this.metricsService.setGauge(
            "bullmq_queue_waiting_jobs",
            "BullMQ waiting jobs",
            counts.waiting ?? 0,
            { queue: name },
          );
          this.metricsService.setGauge(
            "bullmq_queue_active_jobs",
            "BullMQ active jobs",
            counts.active ?? 0,
            { queue: name },
          );
          this.metricsService.setGauge(
            "bullmq_queue_delayed_jobs",
            "BullMQ delayed jobs",
            counts.delayed ?? 0,
            { queue: name },
          );
          this.metricsService.setGauge(
            "bullmq_queue_failed_jobs",
            "BullMQ failed jobs",
            counts.failed ?? 0,
            { queue: name },
          );
          this.metricsService.setGauge(
            "bullmq_queue_oldest_waiting_age_seconds",
            "Age of the oldest BullMQ waiting job",
            oldestAgeSeconds,
            { queue: name },
          );
        } catch (error) {
          this.loggerService.warn({ queue: name, err: error }, "BullMQ queue metrics failed");
        }
      }
    } finally {
      this.measuringQueueHealth = false;
    }
  }

  private async runWorker<T>(
    name: string,
    job: Job<T, unknown, string>,
    handler: (job: Job<T, unknown, string>) => Promise<void>,
  ): Promise<void> {
    const tracer = trace.getTracer("queue-worker");
    const parentContext = extractTraceContext(job);
    await otelContext.with(parentContext, () =>
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

  private instrumentQueue(queue: SharedQueue): void {
    const originalAdd = queue.add.bind(queue);
    // BullMQ has overloaded add signatures; preserving the runtime method is
    // safer than duplicating the overload declarations in this adapter.
    queue.add = ((jobName: string, data: unknown, options?: JobsOptions) =>
      originalAdd(jobName, data, attachTraceContext(options))) as typeof queue.add;
  }
}

async function settleWithin<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("QUEUE_SHUTDOWN_TIMEOUT")), timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function attachTraceContext(options?: JobsOptions): JobsOptions | undefined {
  const carrier: TraceCarrier = {};
  propagation.inject(otelContext.active(), carrier);
  if (!carrier.traceparent) return options;
  return {
    ...options,
    telemetry: {
      ...options?.telemetry,
      metadata: JSON.stringify(carrier),
    },
  };
}

function extractTraceContext(job: Job<unknown, unknown, string>): Context {
  const carrier = parseTraceMetadata(job.opts.telemetry?.metadata) ?? legacyTraceCarrier(job.data);
  if (!isTraceCarrier(carrier)) return otelContext.active();
  return propagation.extract(otelContext.active(), carrier);
}

function parseTraceMetadata(metadata: string | undefined): unknown {
  if (!metadata || metadata.length > MAX_TRACE_METADATA_LENGTH) return undefined;
  try {
    return JSON.parse(metadata);
  } catch {
    return undefined;
  }
}

function legacyTraceCarrier(data: unknown): unknown {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
  return (data as Record<string, unknown>)[TRACE_CONTEXT_FIELD];
}

function isTraceCarrier(value: unknown): value is TraceCarrier {
  if (typeof value !== "object" || value === null) return false;
  const carrier = value as Record<string, unknown>;
  return typeof carrier.traceparent === "string";
}
