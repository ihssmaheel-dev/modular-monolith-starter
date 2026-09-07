import { Injectable, Optional } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { err, ok, Result } from "neverthrow";
import { env } from "../../../../config/env";
import { DatabaseService } from "../../../../infrastructure/database";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { DeleteUserCommand } from "../../../users/application/commands/delete-user.command";
import { HardDeleteOrganizationCommand } from "../../../tenancy/application/commands/hard-delete-organization.command";
import type { PrivacyError } from "../../domain/errors/privacy.errors";
import { AccountPurgedEvent, OrganizationPurgedEvent } from "../../domain/events/privacy.events";
import { PrivacyRepository } from "../../infrastructure/privacy.repository";

const PURGE_BATCH_LIMIT = 25;

/**
 * GDPR Art. 17 grace enforcement: hard-delete subjects whose erasure grace
 * period expired, and age out stale export snapshots. Runs nightly; also
 * exposed to admins via POST /privacy/admin/purge-expired.
 */
@Injectable()
export class PurgeExpiredErasuresCommand {
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly requests: PrivacyRepository,
    private readonly deleteUser: DeleteUserCommand,
    private readonly hardDeleteOrganization: HardDeleteOrganizationCommand,
    private readonly outbox: OutboxService,
    private readonly events: EventEmitter2,
    logger: PinoLoggerService,
    @Optional() private readonly database?: DatabaseService,
  ) {
    this.logger = logger.child({ module: "PurgeExpiredErasures" });
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeScheduled(): Promise<void> {
    if (env.PROCESS_ROLE === "api") return;
    const result = await this.execute();
    if (result.isErr()) {
      this.logger.error({ error: result.error }, "Scheduled erasure purge failed");
    }
  }

  async execute(): Promise<Result<{ purged: number }, PrivacyError>> {
    const operation = () => this.persist();
    if (!this.database) return operation();
    const result = await this.database.withResultTransaction(operation);
    return result.mapErr((error) =>
      error.type === "TRANSACTION_FAILED" ? { type: "PURGE_FAILED" } : error,
    );
  }

  private async persist(): Promise<Result<{ purged: number }, PrivacyError>> {
    const expired = await this.requests.findExpiredErasureBatch(PURGE_BATCH_LIMIT);
    let purged = 0;
    for (const request of expired) {
      const fulfilled = await this.fulfill(request.id, request.type, {
        subjectUserId: request.subjectUserId,
        tenantId: request.tenantId,
      });
      if (fulfilled.isErr()) {
        this.logger.error({ requestId: request.id }, "Erasure purge failed for request");
        continue;
      }
      purged += 1;
    }
    const scrubbed = await this.scrubExpiredExports();
    if (scrubbed.isErr()) return err(scrubbed.error);
    return ok({ purged });
  }

  private async scrubExpiredExports(): Promise<Result<void, PrivacyError>> {
    const stale = await this.requests.findExpiredExportBatch(PURGE_BATCH_LIMIT);
    for (const request of stale) {
      const updated = await this.requests.updateById(request.id, {
        status: "EXPIRED",
        payload: null,
      });
      if (updated.isErr() || !updated.value) {
        this.logger.error({ requestId: request.id }, "Export snapshot scrub failed");
        return err({ type: "PURGE_FAILED" });
      }
    }
    return ok(undefined);
  }

  private async fulfill(
    requestId: string,
    type: string,
    subject: { subjectUserId: string; tenantId?: string },
  ): Promise<Result<void, PrivacyError>> {
    if (type === "ACCOUNT_ERASURE") {
      const deleted = await this.deleteUser.execute(subject.subjectUserId);
      if (deleted.isErr() && deleted.error.type !== "USER_NOT_FOUND") {
        return err({ type: "PURGE_FAILED" });
      }
      await this.requests.updateById(requestId, { status: "FULFILLED", payload: null });
      await this.outbox.dispatchGlobal(
        "privacy.account.purged",
        new AccountPurgedEvent(requestId, subject.subjectUserId),
      );
      await this.events.emitAsync("database.mutated", {
        collectionName: "dsr_requests",
        documentId: requestId,
        action: "UPDATE",
        actorId: undefined,
        tenantId: undefined,
        before: { id: requestId, status: "REQUESTED" },
        after: { id: requestId, status: "FULFILLED" },
      });
      return ok(undefined);
    }
    if (type === "ORGANIZATION_ERASURE" && subject.tenantId) {
      await this.hardDeleteOrganization.execute(subject.tenantId);
      await this.requests.updateById(requestId, { status: "FULFILLED", payload: null });
      await this.outbox.dispatchGlobal(
        "privacy.organization.purged",
        new OrganizationPurgedEvent(requestId, subject.tenantId),
      );
      return ok(undefined);
    }
    return err({ type: "PURGE_FAILED" });
  }
}
