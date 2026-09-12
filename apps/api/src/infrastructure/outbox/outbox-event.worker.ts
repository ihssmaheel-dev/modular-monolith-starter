import { Injectable, OnModuleInit, Optional } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  OutboxEventIdentitySchema,
  parseOutboxEventEnvelope,
  type OutboxEventEnvelope,
} from "@repo/contracts";
import { QueueService } from "../queue/queue.service";
import { PinoLoggerService } from "../logger/logger.service";
import { env } from "../../config/env";
import { DatabaseService } from "../database";
import { TenantContextService } from "../database";
import { OutboxRepository } from "./outbox.repository";
import {
  OUTBOX_DEDUPE_TTL_SECONDS,
  OUTBOX_EVENT_IN_PROGRESS,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_PROCESSING_TTL_SECONDS,
  OUTBOX_QUEUE,
} from "./outbox.constants";
import { RedisService } from "../redis/redis.service";

/**
 * At-least-once delivery contract: a job may be redelivered after crashes,
 * so listeners must tolerate repeats for effects that require it. The
 * event-wide Redis marker prevents concurrent double-consume; per-consumer
 * durable idempotency belongs to effects that need it, not to this fan-out.
 * PUBLISHED is written only here, after listeners complete — never on
 * enqueue (see OutboxRelayDelivery).
 */
@Injectable()
export class OutboxEventWorker implements OnModuleInit {
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly queues: QueueService,
    private readonly events: EventEmitter2,
    logger: PinoLoggerService,
    @Optional() private readonly database?: DatabaseService,
    @Optional() private readonly repository?: OutboxRepository,
    @Optional() private readonly tenantContext?: TenantContextService,
    @Optional() private readonly redis?: RedisService,
  ) {
    this.logger = logger.child({ module: "OutboxEventWorker" });
  }

  onModuleInit(): void {
    if (env.PROCESS_ROLE === "api") return;
    this.queues.addWorker<OutboxEventEnvelope>(OUTBOX_QUEUE, async (job) => {
      let eventId: string | undefined;
      let ownsEvent = false;
      let eventProcessed = false;
      try {
        const envelope = OutboxEventIdentitySchema.safeParse(job.data);
        eventId = envelope.success ? envelope.data.id : undefined;
        const event = parseOutboxEventEnvelope(job.data);
        ownsEvent = await this.claimEvent(event.id);
        if (ownsEvent) {
          await this.emitInScope(event);
          await this.markEventProcessed(event.id);
          eventProcessed = true;
        }
        await this.markPublished(event.id);
        this.logger.debug(
          { eventId: event.id, topic: event.topic },
          "Durable outbox event consumed",
        );
      } catch (error) {
        if (eventId && ownsEvent && !eventProcessed) await this.releaseEvent(eventId);
        const attemptsMade = typeof job.attemptsMade === "number" ? job.attemptsMade : 0;
        if (eventId && attemptsMade + 1 >= OUTBOX_MAX_ATTEMPTS)
          await this.markDeadLetter(eventId, error);
        throw error;
      }
    });
  }

  private async claimEvent(eventId: string): Promise<boolean> {
    const client = this.redis?.getClient();
    if (!client) return true;
    const key = `outbox:consumer:v1:${eventId}`;
    const existing = await client.get(key);
    if (existing === "completed") return false;
    if (existing === "processing") throw new Error(OUTBOX_EVENT_IN_PROGRESS);
    const claimed = await client.set(key, "processing", "EX", OUTBOX_PROCESSING_TTL_SECONDS, "NX");
    if (claimed === "OK") return true;
    throw new Error(OUTBOX_EVENT_IN_PROGRESS);
  }

  private async markEventProcessed(eventId: string): Promise<void> {
    const client = this.redis?.getClient();
    if (!client) return;
    await client.set(`outbox:consumer:v1:${eventId}`, "completed", "EX", OUTBOX_DEDUPE_TTL_SECONDS);
  }

  private async releaseEvent(eventId: string): Promise<void> {
    const client = this.redis?.getClient();
    if (!client) return;
    await client.del(`outbox:consumer:v1:${eventId}`).catch(() => undefined);
  }

  private emitInScope(event: OutboxEventEnvelope): Promise<unknown[]> {
    if (!this.tenantContext) return this.events.emitAsync(event.topic, event.payload);
    return this.tenantContext.runSystem({ mode: env.TENANCY_MODE, tenantId: event.tenantId }, () =>
      this.events.emitAsync(event.topic, event.payload),
    );
  }

  private async markPublished(eventId: string): Promise<void> {
    if (!this.database || !this.repository) return;
    await this.database.withSystemScope(() =>
      this.database!.runTransaction(() =>
        this.repository!.updateById(eventId, {
          status: "PUBLISHED",
          lockedAt: null,
          nextAttemptAt: null,
          error: null,
        }),
      ),
    );
  }

  /**
   * Replays a dead-lettered event. Resetting the row alone is not enough:
   * the consumer marker would skip it as completed, and re-adding the same
   * BullMQ job ID would return the retained failed job without running it.
   * All three states are reset so the next relay tick redelivers for real.
   */
  async replayDeadLetter(eventId: string): Promise<boolean> {
    const client = this.redis?.getClient();
    if (client) {
      await client.del(`outbox:consumer:v1:${eventId}`).catch(() => undefined);
    }
    const queue = this.queues.getQueue(OUTBOX_QUEUE);
    if (queue) {
      try {
        const retained = await queue.getJob(eventId);
        await retained?.remove();
      } catch (error) {
        this.logger.warn({ error, eventId }, "Retained dead-letter job could not be removed");
      }
    }
    if (!this.database || !this.repository) return false;
    const repository = this.repository;
    return this.database.withSystemScope(() => repository.requeueDeadLetter(eventId));
  }

  private async markDeadLetter(eventId: string, error: unknown): Promise<void> {
    if (!this.database || !this.repository) return;
    await this.database.withSystemScope(() =>
      this.database!.runTransaction(() =>
        this.repository!.updateById(eventId, {
          status: "DEAD_LETTER",
          lockedAt: null,
          nextAttemptAt: null,
          error: error instanceof Error ? error.message : String(error),
        }),
      ),
    );
  }
}
