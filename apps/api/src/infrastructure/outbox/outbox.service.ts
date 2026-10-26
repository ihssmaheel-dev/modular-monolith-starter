import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { parseOutboxEventEnvelope, type OutboxEventEnvelope } from "@repo/contracts";
import { OutboxRepository } from "./repositories/outbox.repository";
import { Result, err, ok } from "neverthrow";
import { DatabaseService, TenantContextService } from "../database";
import { env } from "../../config/env";
import { OutboxEventWorker } from "./workers/outbox-event.worker";

export interface OutboxError {
  type:
    | "OUTBOX_WRITE_FAILED"
    | "OUTBOX_INVALID_EVENT"
    | "TENANT_SCOPE_REQUIRED"
    | "OUTBOX_NOT_FOUND";
}

@Injectable()
export class OutboxService {
  constructor(
    private readonly outboxRepository: OutboxRepository,
    private readonly tenantContext: TenantContextService,
    private readonly database: DatabaseService,
    private readonly eventWorker: OutboxEventWorker,
  ) {}

  /** Tenant events require the trusted request/worker tenant context in multi-tenant mode. */
  async dispatchTenant(
    topic: string,
    payload: unknown,
    version = 1,
  ): Promise<Result<void, OutboxError>> {
    const tenantId = this.tenantContext.get().tenantId;
    if (env.TENANCY_MODE === "multi" && !tenantId) {
      return err({ type: "TENANT_SCOPE_REQUIRED" });
    }
    return this.persist(topic, payload, tenantId, version);
  }

  /** Global events are persisted only inside the internal system-scope capability. */
  async dispatchGlobal(
    topic: string,
    payload: unknown,
    version = 1,
  ): Promise<Result<void, OutboxError>> {
    return this.database.withSystemScope(() => this.persist(topic, payload, undefined, version));
  }

  async replayDeadLetter(id: string): Promise<Result<void, OutboxError>> {
    // Prefer the worker path: it also clears the consumer marker and the
    // retained BullMQ job, without which a requeued row would never run.
    const replayed = await this.eventWorker.replayDeadLetter(id);
    return replayed ? ok(undefined) : err({ type: "OUTBOX_NOT_FOUND" });
  }

  private async persist(
    topic: string,
    payload: unknown,
    tenantId: string | undefined,
    version: number,
  ): Promise<Result<void, OutboxError>> {
    let event: OutboxEventEnvelope;
    try {
      // Domain events are class instances; persist their own data properties as
      // the plain record that consumers receive after JSON serialization.
      const eventPayload =
        payload !== null && typeof payload === "object" && !Array.isArray(payload)
          ? { ...payload }
          : payload;
      event = parseOutboxEventEnvelope({
        id: randomUUID(),
        topic,
        payload: eventPayload,
        tenantId,
        version,
      });
    } catch {
      return err({ type: "OUTBOX_INVALID_EVENT" });
    }
    let result: Awaited<ReturnType<OutboxRepository["create"]>>;
    try {
      result = await this.outboxRepository.create({
        id: event.id,
        tenantId,
        topic,
        schemaVersion: event.version,
        payload: event.payload,
        status: "PENDING",
      });
    } catch {
      return err({ type: "OUTBOX_WRITE_FAILED" });
    }

    if (result.isErr()) {
      return err({ type: "OUTBOX_WRITE_FAILED" });
    }

    return ok(undefined);
  }
}
