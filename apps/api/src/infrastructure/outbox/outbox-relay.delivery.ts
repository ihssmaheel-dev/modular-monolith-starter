import { Injectable, Optional } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { parseOutboxEventEnvelope } from "@repo/contracts";
import { MetricsService } from "../metrics/metrics.service";
import { PinoLoggerService } from "../logger/logger.service";
import { DatabaseService } from "../database";
import { QueueService } from "../queue/queue.service";
import { OutboxEvent, OutboxRepository } from "./outbox.repository";
import {
  OUTBOX_DURABLE_QUEUE_UNAVAILABLE,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_QUEUE,
} from "./outbox.constants";
import { env } from "../../config/env";

const RETRY_BASE_DELAY_MS = 5_000;
const RETRY_MULTIPLIER = 2;

@Injectable()
export class OutboxRelayDelivery {
  constructor(
    private readonly repository: OutboxRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly metrics: MetricsService,
    private readonly database: DatabaseService,
    logger: PinoLoggerService,
    @Optional() private readonly queues?: QueueService,
  ) {
    this.logger = logger.child({ module: "OutboxRelayDelivery" });
  }

  private readonly logger: PinoLoggerService;

  async deliver(event: OutboxEvent): Promise<void> {
    try {
      const envelope = parseOutboxEventEnvelope({
        id: event.id,
        topic: event.topic,
        version: 1,
        tenantId: event.tenantId,
        payload: event.payload,
      });
      const queue = this.queues?.getQueue(OUTBOX_QUEUE);
      if (queue) {
        await queue.add(event.topic, envelope, {
          jobId: event.id,
          attempts: OUTBOX_MAX_ATTEMPTS,
          backoff: { type: "exponential", delay: RETRY_BASE_DELAY_MS },
          removeOnComplete: 1000,
          removeOnFail: 1000,
        });
      } else {
        if (env.NODE_ENV === "production") {
          throw new Error(OUTBOX_DURABLE_QUEUE_UNAVAILABLE);
        }
        await this.eventEmitter.emitAsync(event.topic, event.payload);
      }
      await this.database.runTransaction(() =>
        this.repository.updateById(event.id, {
          status: "PUBLISHED",
          lockedAt: null,
          nextAttemptAt: null,
          error: null,
        }),
      );
      this.recordLatency(event);
    } catch (error) {
      await this.scheduleRetry(event, error);
    }
  }

  private async scheduleRetry(event: OutboxEvent, error: unknown): Promise<void> {
    const attempts = event.attempts + 1;
    const exhausted = attempts >= OUTBOX_MAX_ATTEMPTS;
    const delay = withJitter(RETRY_BASE_DELAY_MS * RETRY_MULTIPLIER ** Math.max(0, attempts - 1));
    await this.database.runTransaction(() =>
      this.repository.updateById(event.id, {
        status: exhausted ? "DEAD_LETTER" : "PENDING",
        attempts,
        error: error instanceof Error ? error.message : String(error),
        nextAttemptAt: exhausted ? null : new Date(Date.now() + delay),
        lockedAt: null,
      }),
    );
    if (exhausted) {
      this.metrics.incrementCounter("outbox_dead_letter_total", "Outbox dead-letter events", 1, {
        topic: event.topic,
      });
      this.logger.error(
        { eventId: event.id, topic: event.topic, attempts },
        "Outbox event dead-lettered",
      );
      return;
    }
    this.metrics.incrementCounter("outbox_retry_total", "Outbox delivery retries", 1, {
      topic: event.topic,
    });
    this.logger.warn(
      { eventId: event.id, topic: event.topic, attempts, nextDelayMs: delay },
      "Outbox retry scheduled",
    );
  }

  private recordLatency(event: OutboxEvent): void {
    try {
      if (!(event.createdAt instanceof Date) || Number.isNaN(event.createdAt.getTime())) {
        this.logger.warn({ eventId: event.id }, "Outbox event has no valid creation timestamp");
        return;
      }
      this.metrics.recordHistogram(
        "outbox_processing_latency_ms",
        "Latency between outbox event creation and processing",
        Date.now() - event.createdAt.getTime(),
      );
    } catch (error) {
      this.logger.warn({ err: error, eventId: event.id }, "Outbox latency metric failed");
    }
  }
}

function withJitter(delayMs: number): number {
  return Math.round(delayMs * (0.8 + Math.random() * 0.4));
}
