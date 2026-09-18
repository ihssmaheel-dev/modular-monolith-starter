import { Injectable, OnModuleInit, Optional } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  OutboxEventIdentitySchema,
  parseOutboxEventEnvelope,
  type OutboxEventEnvelope,
  type OutboxEventMetadata,
} from "@repo/contracts";
import { QueueService } from "../../queue/queue.service";
import { PinoLoggerService } from "../../logger/logger.service";
import { env } from "../../../config/env";
import { DatabaseService, TenantContextService } from "../../database";
import { OutboxRepository } from "../repositories/outbox.repository";
import {
  OUTBOX_DEDUPE_TTL_SECONDS,
  OUTBOX_EVENT_IN_PROGRESS,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_PROCESSING_TTL_SECONDS,
  OUTBOX_QUEUE,
} from "../outbox.constants";
import { RedisService } from "../../redis/redis.service";
import { OperationReceiptService } from "../../idempotency/operation-receipt.service";

const OUTBOX_CONSUMER_OPERATION = "outbox:event-consumer:v1";
const OUTBOX_COMPLETED_RECEIPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

/**
 * At-least-once delivery contract: a job may be redelivered after crashes,
 * so listeners must tolerate repeats for effects that require it. The
 * durable operation receipts prevent concurrent double-consume across worker
 * restarts; Redis remains a fast fallback for installations without the
 * database idempotency module.
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
    @Optional() private readonly operationReceipts?: OperationReceiptService,
  ) {
    this.logger = logger.child({ module: "OutboxEventWorker" });
  }

  onModuleInit(): void {
    if (env.PROCESS_ROLE === "api") return;
    this.queues.addWorker<OutboxEventEnvelope>(OUTBOX_QUEUE, async (job) => {
      let eventId: string | undefined;
      let ownsEvent = false;
      let eventProcessed = false;
      let receiptId: string | undefined;
      try {
        const envelope = OutboxEventIdentitySchema.safeParse(job.data);
        eventId = envelope.success ? envelope.data.id : undefined;
        const event = parseOutboxEventEnvelope(job.data);
        const claim = await this.claimEvent(event);
        ownsEvent = claim.claimed;
        receiptId = claim.receiptId;
        if (claim.claimed) {
          await this.emitInScope(event);
          await this.markEventProcessed(event.id);
          await this.completeEvent(receiptId);
          eventProcessed = true;
        }
        await this.markPublished(event.id);
        this.logger.debug(
          { eventId: event.id, topic: event.topic },
          "Durable outbox event consumed",
        );
      } catch (error) {
        if (eventId && ownsEvent && !eventProcessed) await this.releaseEvent(eventId, receiptId);
        const attemptsMade = typeof job.attemptsMade === "number" ? job.attemptsMade : 0;
        if (eventId && attemptsMade + 1 >= OUTBOX_MAX_ATTEMPTS)
          await this.markDeadLetter(eventId, error);
        throw error;
      }
    });
  }

  private async claimEvent(
    event: OutboxEventEnvelope,
  ): Promise<{ claimed: boolean; receiptId?: string }> {
    if (this.operationReceipts && this.database) {
      const claim = await this.database.withSystemScope(() =>
        this.database!.runTransaction(() =>
          this.operationReceipts!.claim({
            operationId: event.id,
            operationType: OUTBOX_CONSUMER_OPERATION,
            scopeId: event.tenantId ?? "global",
            tenantId: event.tenantId,
            requestHash: event.id,
            expiresAt: new Date(Date.now() + OUTBOX_PROCESSING_TTL_SECONDS * 1000),
          }),
        ),
      );
      if (claim.isErr()) {
        if (claim.error.type === "OPERATION_IN_PROGRESS") throw new Error(OUTBOX_EVENT_IN_PROGRESS);
        throw new Error(`OUTBOX_DURABLE_CLAIM_FAILED:${claim.error.type}`);
      }
      if (claim.value.state === "COMPLETED") return { claimed: false };
      return { claimed: true, receiptId: claim.value.receiptId };
    }

    const eventId = event.id;
    const client = this.redis?.getClient();
    if (!client) return { claimed: true };
    const key = `outbox:consumer:v1:${eventId}`;
    const existing = await client.get(key);
    if (existing === "completed") return { claimed: false };
    if (existing === "processing") throw new Error(OUTBOX_EVENT_IN_PROGRESS);
    const claimed = await client.set(key, "processing", "EX", OUTBOX_PROCESSING_TTL_SECONDS, "NX");
    if (claimed === "OK") return { claimed: true };
    throw new Error(OUTBOX_EVENT_IN_PROGRESS);
  }

  private async markEventProcessed(eventId: string): Promise<void> {
    if (this.operationReceipts) return;
    const client = this.redis?.getClient();
    if (!client) return;
    await client.set(`outbox:consumer:v1:${eventId}`, "completed", "EX", OUTBOX_DEDUPE_TTL_SECONDS);
  }

  private async releaseEvent(eventId: string, receiptId?: string): Promise<void> {
    if (receiptId && this.operationReceipts && this.database) {
      await this.database
        .withSystemScope(() =>
          this.database!.runTransaction(() => this.operationReceipts!.release(receiptId)),
        )
        .catch((error) =>
          this.logger.warn({ error, eventId }, "Durable outbox claim release failed"),
        );
      return;
    }
    const client = this.redis?.getClient();
    if (!client) return;
    await client.del(`outbox:consumer:v1:${eventId}`).catch(() => undefined);
  }

  private async completeEvent(receiptId?: string): Promise<void> {
    if (!receiptId || !this.operationReceipts || !this.database) return;
    const completed = await this.database.withSystemScope(() =>
      this.database!.runTransaction(() =>
        this.operationReceipts!.complete(
          receiptId,
          { completed: true },
          new Date(Date.now() + OUTBOX_COMPLETED_RECEIPT_RETENTION_MS),
        ),
      ),
    );
    if (completed.isErr()) {
      throw new Error(`OUTBOX_DURABLE_COMPLETE_FAILED:${completed.error.type}`);
    }
  }

  private emitInScope(event: OutboxEventEnvelope): Promise<unknown[]> {
    const meta: OutboxEventMetadata = {
      eventId: event.id,
      topic: event.topic,
      tenantId: event.tenantId,
    };
    if (!this.tenantContext) return this.events.emitAsync(event.topic, event.payload, meta);
    return this.tenantContext.runSystem({ mode: env.TENANCY_MODE, tenantId: event.tenantId }, () =>
      this.events.emitAsync(event.topic, event.payload, meta),
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
    if (this.operationReceipts && this.database) {
      await this.database.withSystemScope(() =>
        this.database!.runTransaction(() =>
          this.operationReceipts!.releaseByOperationId(OUTBOX_CONSUMER_OPERATION, eventId),
        ),
      );
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
