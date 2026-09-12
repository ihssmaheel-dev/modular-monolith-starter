import { Injectable, Optional } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { err, ok, Result } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";
import { DatabaseService } from "../../../../infrastructure/database";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import {
  ListOrganizationsQuery,
  type OrganizationAccess,
} from "../../../tenancy/application/queries/list-organizations.query";
import { DeleteOrganizationDataCommand } from "../../../tenancy/application/commands/delete-organization-data.command";
import { PurgeUserNotificationsCommand } from "../../../notifications/application/commands/purge-user-notifications.command";
import { DsrRequest } from "../../domain/entities/dsr.entity";
import type { PrivacyError } from "../../domain/errors/privacy.errors";
import { OrganizationErasureRequestedEvent } from "../../domain/events/privacy.events";
import { PrivacyRepository } from "../../infrastructure/privacy.repository";

const GRACE_DAYS = 30;
const ORG_PAGE_LIMIT = 100;

/**
 * GDPR Art. 17 (tenant scope): owner-confirmed erasure of an organization.
 * This request scrubs member data and commits the erasure plan; notes/files
 * bytes are destroyed later by PurgeExpiredErasuresCommand, because S3
 * deletions cannot roll back with the database transaction. The
 * organization shell is hard-deleted after the grace period.
 */
@Injectable()
export class RequestOrganizationErasureCommand {
  constructor(
    private readonly requests: PrivacyRepository,
    private readonly listOrganizations: ListOrganizationsQuery,
    private readonly deleteOrganizationData: DeleteOrganizationDataCommand,
    private readonly purgeNotifications: PurgeUserNotificationsCommand,
    private readonly outbox: OutboxService,
    private readonly events: EventEmitter2,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    organizationId: string,
    confirmationName: string,
  ): Promise<Result<DsrRequest, PrivacyError>> {
    const operation = () => this.persist(actor, organizationId, confirmationName);
    if (!this.database) return operation();
    const result = await this.database.withResultTransaction(operation);
    return result.mapErr((error) =>
      error.type === "TRANSACTION_FAILED" ? { type: "ERASURE_FAILED" } : error,
    );
  }

  private async persist(
    actor: AuthenticatedUser,
    organizationId: string,
    confirmationName: string,
  ): Promise<Result<DsrRequest, PrivacyError>> {
    // Owner check against trusted membership reads (paginated past the
    // first page). The route guard cannot decide this: TenantAgnostic
    // routes carry no tenant role, so the command is the single enforcement
    // point, for every role including global admins.
    const access = await this.findAccess(actor, organizationId);
    if (access.isErr()) return err({ type: "ERASURE_FAILED" });
    if (!access.value || access.value.role !== "owner") {
      return err({ type: "ORG_ERASE_FORBIDDEN" });
    }
    if (access.value.organization.data.name !== confirmationName) {
      return err({ type: "INVALID_CONFIRMATION" });
    }

    const notificationsPurged = await this.purgeNotifications.purgeTenant(organizationId);
    if (notificationsPurged.isErr()) return err({ type: "ERASURE_FAILED" });

    const scrubbed = await this.deleteOrganizationData.execute(organizationId);
    if (scrubbed.isErr()) return err({ type: "ERASURE_FAILED" });

    const expiresAt = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000);
    const created = await this.requests.create({
      type: "ORGANIZATION_ERASURE",
      status: "REQUESTED",
      subjectUserId: actor.sub,
      tenantId: organizationId,
      expiresAt,
    });
    if (created.isErr()) return err({ type: "ERASURE_FAILED" });

    const dispatched = await this.outbox.dispatchGlobal(
      "privacy.organization.erasure.requested",
      new OrganizationErasureRequestedEvent(created.value.id, organizationId, actor.sub),
    );
    if (dispatched.isErr()) return err({ type: "ERASURE_FAILED" });

    await this.emitMutated({
      collectionName: "dsr_requests",
      documentId: created.value.id,
      action: "CREATE",
      actorId: actor.sub,
      tenantId: organizationId,
      before: null,
      after: { id: created.value.id, type: "ORGANIZATION_ERASURE", status: "REQUESTED" },
    });
    return ok(created.value);
  }

  private async findAccess(
    actor: AuthenticatedUser,
    organizationId: string,
  ): Promise<Result<OrganizationAccess | null, { type: "ERASURE_FAILED" }>> {
    let page = 1;
    for (;;) {
      const orgsResult = await this.listOrganizations.execute(actor, page, ORG_PAGE_LIMIT);
      if (orgsResult.isErr()) return err({ type: "ERASURE_FAILED" });
      const access = orgsResult.value.items.find((a) => a.organization.data.id === organizationId);
      if (access) return ok(access);
      if (page >= orgsResult.value.totalPages) return ok(null);
      page += 1;
    }
  }

  private async emitMutated(payload: Record<string, unknown>): Promise<void> {
    if (this.database) {
      await this.database.emitAfterCommit(this.events, "database.mutated", payload);
      return;
    }
    await this.events.emitAsync("database.mutated", payload);
  }
}
