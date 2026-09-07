import { Injectable, Optional } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { err, ok, Result } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";
import { env } from "../../../../config/env";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";
import { SessionService } from "../../../../infrastructure/session/session.service";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { GetUserByIdQuery } from "../../../users/application/queries/get-user-by-id.query";
import { VerifyUserCredentialsQuery } from "../../../users/application/queries/verify-user-credentials.query";
import { AnonymizeUserCommand } from "../../../users/application/commands/anonymize-user.command";
import { IncrementAuthVersionCommand } from "../../../users/application/commands/increment-auth-version.command";
import { ListOrganizationsQuery } from "../../../tenancy/application/queries/list-organizations.query";
import { CanDeleteUserQuery } from "../../../tenancy/application/queries/can-delete-user.query";
import { PurgeUserTenancyDataCommand } from "../../../tenancy/application/commands/purge-user-tenancy-data.command";
import { PurgeUserNotesCommand } from "../../../notes/application/commands/purge-user-notes.command";
import { PurgeUserFilesCommand } from "../../../files/application/commands/purge-user-files.command";
import { DsrRequest } from "../../domain/entities/dsr.entity";
import type { PrivacyError } from "../../domain/errors/privacy.errors";
import { AccountErasureRequestedEvent } from "../../domain/events/privacy.events";
import { PrivacyRepository } from "../../infrastructure/privacy.repository";

const GRACE_DAYS = 30;
const EXPORT_PAGE_LIMIT = 100;

/**
 * GDPR Art. 17: revoke access now, anonymize identifiers now, hard-delete
 * after a 30-day grace period (see PurgeExpiredErasuresCommand).
 */
@Injectable()
export class RequestAccountErasureCommand {
  constructor(
    private readonly requests: PrivacyRepository,
    private readonly getUserById: GetUserByIdQuery,
    private readonly verifyCredentials: VerifyUserCredentialsQuery,
    private readonly anonymizeUser: AnonymizeUserCommand,
    private readonly incrementAuthVersion: IncrementAuthVersionCommand,
    private readonly sessions: SessionService,
    private readonly listOrganizations: ListOrganizationsQuery,
    private readonly canDeleteUser: CanDeleteUserQuery,
    private readonly purgeTenancy: PurgeUserTenancyDataCommand,
    private readonly purgeNotes: PurgeUserNotesCommand,
    private readonly purgeFiles: PurgeUserFilesCommand,
    private readonly tenantContext: TenantContextService,
    private readonly cache: DistributedCacheService,
    private readonly outbox: OutboxService,
    private readonly events: EventEmitter2,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    password: string,
  ): Promise<Result<DsrRequest, PrivacyError>> {
    const operation = () => this.persist(actor, password);
    if (!this.database) return operation();
    const result = await this.database.withResultTransaction(operation);
    return result.mapErr((error) =>
      error.type === "TRANSACTION_FAILED" ? { type: "ERASURE_FAILED" } : error,
    );
  }

  private async persist(
    actor: AuthenticatedUser,
    password: string,
  ): Promise<Result<DsrRequest, PrivacyError>> {
    const userResult = await this.getUserById.execute(actor.sub);
    if (userResult.isErr()) return err({ type: "ERASURE_FAILED" });
    const user = userResult.value;

    const verified = await this.verifyCredentials.execute(user.email, password);
    if (verified.isErr() || !verified.value) return err({ type: "INVALID_PASSWORD" });

    const existing = await this.requests.findPendingErasureForSubject(actor.sub);
    if (existing.isErr()) return err({ type: "ERASURE_FAILED" });
    if (existing.value) return err({ type: "ERASURE_ALREADY_REQUESTED" });

    const deletable = await this.canDeleteUser.execute(actor.sub);
    if (deletable.isErr()) return err({ type: "LAST_OWNER_BLOCKED" });

    const orgsResult = await this.listOrganizations.execute(actor, 1, EXPORT_PAGE_LIMIT);
    const tenantIds = orgsResult.isOk()
      ? [...new Set(orgsResult.value.items.map((a) => a.organization.data.id))]
      : [];

    await this.sessions.revokeAllForUser(actor.sub);
    await this.incrementAuthVersion.execute(actor.sub);

    const anonymized = await this.anonymizeUser.execute(actor.sub);
    if (anonymized.isErr()) return err({ type: "ERASURE_FAILED" });

    const tenancyPurged = await this.purgeTenancy.execute(actor.sub, user.email);
    if (tenancyPurged.isErr()) return err({ type: "ERASURE_FAILED" });

    for (const tenantId of tenantIds) {
      const purged = await this.purgeTenantData(actor.sub, tenantId);
      if (purged.isErr()) return err({ type: "ERASURE_FAILED" });
    }
    if (env.TENANCY_MODE === "single") {
      const purged = await this.purgeTenantData(actor.sub, undefined);
      if (purged.isErr()) return err({ type: "ERASURE_FAILED" });
    }

    await this.cache.invalidateGlobal(`user:${actor.sub}`);

    const expiresAt = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000);
    const created = await this.requests.create({
      type: "ACCOUNT_ERASURE",
      status: "REQUESTED",
      subjectUserId: actor.sub,
      expiresAt,
    });
    if (created.isErr()) return err({ type: "ERASURE_FAILED" });

    const dispatched = await this.outbox.dispatchGlobal(
      "privacy.account.erasure.requested",
      new AccountErasureRequestedEvent(created.value.id, actor.sub),
    );
    if (dispatched.isErr()) return err({ type: "ERASURE_FAILED" });

    await this.emitMutated({
      collectionName: "dsr_requests",
      documentId: created.value.id,
      action: "CREATE",
      actorId: actor.sub,
      tenantId: undefined,
      before: null,
      after: { id: created.value.id, type: "ACCOUNT_ERASURE", status: "REQUESTED" },
    });
    return ok(created.value);
  }

  private async emitMutated(payload: Record<string, unknown>): Promise<void> {
    if (this.database) {
      await this.database.emitAfterCommit(this.events, "database.mutated", payload);
      return;
    }
    await this.events.emitAsync("database.mutated", payload);
  }

  private async purgeTenantData(
    userId: string,
    tenantId: string | undefined,
  ): Promise<Result<void, PrivacyError>> {
    const run =
      tenantId !== undefined && env.TENANCY_MODE === "multi"
        ? () => this.tenantContext.run({ mode: "multi", tenantId }, () => this.purgeScope(userId))
        : () => this.purgeScope(userId);
    return run();
  }

  private async purgeScope(userId: string): Promise<Result<void, PrivacyError>> {
    const notes = await this.purgeNotes.execute(userId);
    if (notes.isErr()) return err({ type: "ERASURE_FAILED" });
    const files = await this.purgeFiles.execute(userId);
    if (files.isErr()) return err({ type: "ERASURE_FAILED" });
    return ok(undefined);
  }
}
