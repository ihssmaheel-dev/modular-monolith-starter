import { Injectable, Optional } from "@nestjs/common";
import { OutboxRepository } from "./outbox.repository";
import { Result, err, ok } from "neverthrow";
import { DatabaseService, TenantContextService } from "../database";
import { env } from "../../config/env";
import type { OutboxEventWorker } from "./outbox-event.worker";

export interface OutboxError {
  type: "OUTBOX_WRITE_FAILED" | "TENANT_SCOPE_REQUIRED" | "OUTBOX_NOT_FOUND";
}

@Injectable()
export class OutboxService {
  constructor(
    private readonly outboxRepository: OutboxRepository,
    private readonly tenantContext: TenantContextService,
    private readonly database: DatabaseService,
    @Optional() private readonly eventWorker?: OutboxEventWorker,
  ) {}

  /** Tenant events require the trusted request/worker tenant context in multi-tenant mode. */
  async dispatchTenant(topic: string, payload: unknown): Promise<Result<void, OutboxError>> {
    const tenantId = this.tenantContext.get().tenantId;
    if (env.TENANCY_MODE === "multi" && !tenantId) {
      return err({ type: "TENANT_SCOPE_REQUIRED" });
    }
    return this.persist(topic, payload, tenantId);
  }

  /** Global events are persisted only inside the internal system-scope capability. */
  async dispatchGlobal(topic: string, payload: unknown): Promise<Result<void, OutboxError>> {
    return this.database.withSystemScope(() => this.persist(topic, payload, undefined));
  }

  async replayDeadLetter(id: string): Promise<Result<void, OutboxError>> {
    // Prefer the worker path: it also clears the consumer marker and the
    // retained BullMQ job, without which a requeued row would never run.
    if (this.eventWorker) {
      const replayed = await this.eventWorker.replayDeadLetter(id);
      return replayed ? ok(undefined) : err({ type: "OUTBOX_NOT_FOUND" });
    }
    const replayed = await this.database.withSystemScope(() =>
      this.outboxRepository.requeueDeadLetter(id),
    );
    return replayed ? ok(undefined) : err({ type: "OUTBOX_NOT_FOUND" });
  }

  private async persist(
    topic: string,
    payload: unknown,
    tenantId: string | undefined,
  ): Promise<Result<void, OutboxError>> {
    let result: Awaited<ReturnType<OutboxRepository["create"]>>;
    try {
      result = await this.outboxRepository.create({
        tenantId,
        topic,
        payload,
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
