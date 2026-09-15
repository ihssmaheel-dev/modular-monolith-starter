import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { err, ok, Result } from "neverthrow";
import { env } from "../../../../config/env";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { DeleteUserCommand } from "../../../users/application/commands/delete-user.command";
import { HardDeleteOrganizationCommand } from "../../../tenancy/application/commands/hard-delete-organization.command";
import { DataLifecycleRegistry } from "../../../../infrastructure/lifecycle/data-lifecycle.registry";
import type { PrivacyError } from "../../domain/errors/privacy.errors";
import { AccountPurgedEvent, OrganizationPurgedEvent } from "../../domain/events/privacy.events";
import { PrivacyRepository } from "../../infrastructure/repositories/privacy.repository";
import type { DsrRequest } from "../../domain/entities/dsr.entity";

const PURGE_BATCH_LIMIT = 1_000;

/**
 * GDPR Art. 17 grace enforcement: hard-delete subjects whose erasure grace
 * period expired, and age out stale export snapshots. Runs hourly; also
 * exposed to admins via POST /privacy/admin/purge-expired.
 */
@Injectable()
export class PurgeExpiredErasuresCommand {
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly requests: PrivacyRepository,
    private readonly deleteUser: DeleteUserCommand,
    private readonly hardDeleteOrganization: HardDeleteOrganizationCommand,
    private readonly lifecycle: DataLifecycleRegistry,
    private readonly outbox: OutboxService,
    private readonly events: EventEmitter2,
    logger: PinoLoggerService,
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContextService,
  ) {
    this.logger = logger.child({ module: "PurgeExpiredErasures" });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async purgeScheduled(): Promise<void> {
    if (env.PROCESS_ROLE === "api") return;
    const result = await this.execute();
    if (result.isErr()) {
      this.logger.error({ error: result.error }, "Scheduled erasure purge failed");
    }
  }

  async execute(): Promise<Result<{ purged: number }, PrivacyError>> {
    const context =
      env.TENANCY_MODE === "single" ? { mode: "single" as const } : { mode: "multi" as const };
    return this.tenantContext.runSystem(context, () => this.persist());
  }

  private async persist(): Promise<Result<{ purged: number }, PrivacyError>> {
    const batch = await this.database.withTransaction(() =>
      this.requests.findExpiredErasureBatch(PURGE_BATCH_LIMIT),
    );
    if (batch.isErr()) return err({ type: "PURGE_FAILED" });
    let purged = 0;
    for (const request of batch.value) {
      const outcome = await this.fulfillRequest(request);
      if (outcome === "fulfilled") purged += 1;
    }
    const scrubbed = await this.scrubExpiredExports();
    if (scrubbed.isErr()) return err(scrubbed.error);
    return ok({ purged });
  }

  /**
   * Fulfills one request end to end. Transient failures keep the REQUESTED
   * state (retried next cycle); structurally invalid requests move to FAILED
   * with an error log instead of poisoning every nightly run.
   */
  private async fulfillRequest(request: DsrRequest): Promise<"fulfilled" | "retry" | "failed"> {
    if (request.type === "ACCOUNT_ERASURE") {
      const outcome = await this.fulfillAccount(request);
      if (outcome === "failed") await this.markFailed(request.id);
      return outcome;
    }
    if (request.type === "ORGANIZATION_ERASURE" && request.tenantId) {
      return this.fulfillOrganization(request);
    }
    this.logger.error(
      { requestId: request.id, type: request.type },
      "Erasure request is not fulfillable",
    );
    await this.markFailed(request.id);
    return "failed";
  }

  private async scrubExpiredExports(): Promise<Result<void, PrivacyError>> {
    const stale = await this.database.withTransaction(() =>
      this.requests.findExpiredExportBatch(PURGE_BATCH_LIMIT),
    );
    if (stale.isErr()) return err({ type: "PURGE_FAILED" });
    for (const request of stale.value) {
      // One poisoned snapshot must not block the rest of the batch.
      const updated = await this.database.withResultTransaction(() =>
        this.requests.updateById(request.id, { status: "EXPIRED", payload: null }),
      );
      if (updated.isErr() || !updated.value) {
        this.logger.error({ requestId: request.id }, "Export snapshot scrub failed");
      }
    }
    return ok(undefined);
  }

  /**
   * Destroys one account's data in two phases (C03). Phase 1 runs outside
   * any transaction: S3 bytes cannot roll back, so they are deleted first
   * by idempotent bounded purges; a crash simply retries the leftovers next
   * cycle. Phase 2 commits the row cleanup and the FULFILLED transition in
   * one transaction.
   */
  private async fulfillAccount(request: DsrRequest): Promise<"fulfilled" | "retry" | "failed"> {
    const plan = readTenantPlan(request.payload);
    if (!plan) {
      this.logger.error({ requestId: request.id }, "Account erasure plan is invalid");
      return "failed";
    }
    const destroyed = await this.lifecycle.purgeSubject(request.subjectUserId, plan);
    if (destroyed.isErr()) {
      this.logger.error(
        { requestId: request.id, contributor: destroyed.error.contributor },
        "Account data destruction failed, retrying next cycle",
      );
      return "retry";
    }
    const finalize = async (): Promise<Result<"fulfilled" | "failed", PrivacyError>> => {
      const deleted = await this.deleteUser.execute(request.subjectUserId);
      if (deleted.isErr() && deleted.error.type !== "USER_NOT_FOUND") {
        // Ownership gained during grace needs a human (transfer first):
        // retrying nightly would never converge, so fail explicitly.
        if (deleted.error.type === "USER_OWNS_ORGANIZATION") return ok("failed");
        return err({ type: "PURGE_FAILED" });
      }
      const marked = await this.requests.updateById(request.id, {
        status: "FULFILLED",
        payload: null,
      });
      if (marked.isErr() || !marked.value) return err({ type: "PURGE_FAILED" });
      const dispatched = await this.outbox.dispatchGlobal(
        "privacy.account.purged",
        new AccountPurgedEvent(request.id, request.subjectUserId),
      );
      if (dispatched.isErr()) return err({ type: "PURGE_FAILED" });
      await this.emitMutated({
        collectionName: "dsr_requests",
        documentId: request.id,
        action: "UPDATE",
        actorId: undefined,
        tenantId: undefined,
        before: { id: request.id, status: "REQUESTED" },
        after: { id: request.id, status: "FULFILLED" },
      });
      return ok("fulfilled" as const);
    };
    const result = await this.database.withResultTransaction(finalize);
    if (result.isErr()) {
      this.logger.error({ requestId: request.id }, "Account finalize failed, retrying next cycle");
      return "retry";
    }
    if (result.value === "failed") {
      await this.markFailed(request.id);
      return "failed";
    }
    return "fulfilled";
  }

  private async fulfillOrganization(
    request: DsrRequest,
  ): Promise<"fulfilled" | "retry" | "failed"> {
    const tenantId = request.tenantId;
    if (!tenantId) {
      this.logger.error({ requestId: request.id }, "Organization erasure has no tenant scope");
      await this.markFailed(request.id);
      return "failed";
    }
    const destroyed = await this.lifecycle.purgeTenant(tenantId);
    if (destroyed.isErr()) {
      this.logger.error({ requestId: request.id, tenantId }, "Tenant data destruction failed");
      return "retry";
    }
    const finalize = async (): Promise<Result<void, PrivacyError>> => {
      const deleted = await this.hardDeleteOrganization.execute(tenantId);
      if (deleted.isErr()) return err({ type: "PURGE_FAILED" });
      const marked = await this.requests.updateById(request.id, {
        status: "FULFILLED",
        payload: null,
      });
      if (marked.isErr() || !marked.value) return err({ type: "PURGE_FAILED" });
      const dispatched = await this.outbox.dispatchGlobal(
        "privacy.organization.purged",
        new OrganizationPurgedEvent(request.id, tenantId),
      );
      if (dispatched.isErr()) return err({ type: "PURGE_FAILED" });
      return ok(undefined);
    };
    const result = await this.database.withResultTransaction(finalize);
    if (result.isErr()) {
      this.logger.error({ requestId: request.id, tenantId }, "Organization finalize failed");
      return "retry";
    }
    return "fulfilled";
  }

  private async markFailed(requestId: string): Promise<void> {
    const marked = await this.database.withResultTransaction(() =>
      this.requests.updateById(requestId, { status: "FAILED", payload: null }),
    );
    if (marked.isErr() || !marked.value) {
      this.logger.error({ requestId }, "Erasure request could not be marked failed");
    }
  }

  private async emitMutated(payload: Record<string, unknown>): Promise<void> {
    await this.database.emitAfterCommit(this.events, "database.mutated", payload);
  }
}

/**
 * Reads the erasure plan committed at request time. Unknown shapes mean a
 * corrupt or foreign request row: the caller purges nothing and fails it.
 */
function readTenantPlan(payload: unknown): string[] | null {
  if (typeof payload !== "object" || payload === null) return null;
  const tenantIds = (payload as Record<string, unknown>).tenantIds;
  if (!Array.isArray(tenantIds)) return null;
  if (!tenantIds.every((id) => typeof id === "string" && id.length > 0)) return null;
  return [...new Set(tenantIds as string[])];
}
