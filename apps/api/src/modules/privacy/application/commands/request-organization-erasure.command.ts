import { Injectable, Optional } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { err, ok, Result } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";
import { env } from "../../../../config/env";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { ListOrganizationsQuery } from "../../../tenancy/application/queries/list-organizations.query";
import { DeleteOrganizationDataCommand } from "../../../tenancy/application/commands/delete-organization-data.command";
import { PurgeTenantNotesCommand } from "../../../notes/application/commands/purge-tenant-notes.command";
import { PurgeTenantFilesCommand } from "../../../files/application/commands/purge-tenant-files.command";
import { DsrRequest } from "../../domain/entities/dsr.entity";
import type { PrivacyError } from "../../domain/errors/privacy.errors";
import { OrganizationErasureRequestedEvent } from "../../domain/events/privacy.events";
import { PrivacyRepository } from "../../infrastructure/privacy.repository";

const GRACE_DAYS = 30;
const ORG_PAGE_LIMIT = 100;

/**
 * GDPR Art. 17 (tenant scope): owner-confirmed erasure of an organization.
 * Member data is scrubbed immediately; the organization shell is hard-deleted
 * after the grace period (see PurgeExpiredErasuresCommand).
 */
@Injectable()
export class RequestOrganizationErasureCommand {
  constructor(
    private readonly requests: PrivacyRepository,
    private readonly listOrganizations: ListOrganizationsQuery,
    private readonly deleteOrganizationData: DeleteOrganizationDataCommand,
    private readonly purgeNotes: PurgeTenantNotesCommand,
    private readonly purgeFiles: PurgeTenantFilesCommand,
    private readonly tenantContext: TenantContextService,
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
    const orgsResult = await this.listOrganizations.execute(actor, 1, ORG_PAGE_LIMIT);
    if (orgsResult.isErr()) return err({ type: "ERASURE_FAILED" });
    const access = orgsResult.value.items.find((a) => a.organization.data.id === organizationId);
    if (!access || access.role !== "owner") return err({ type: "ORG_ERASE_FORBIDDEN" });
    if (access.organization.data.name !== confirmationName) {
      return err({ type: "INVALID_CONFIRMATION" });
    }

    const purged = await this.purgeTenantScope(organizationId);
    if (purged.isErr()) return err({ type: "ERASURE_FAILED" });

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

    try {
      await this.events.emitAsync("database.mutated", {
        collectionName: "dsr_requests",
        documentId: created.value.id,
        action: "CREATE",
        actorId: actor.sub,
        tenantId: organizationId,
        before: null,
        after: { id: created.value.id, type: "ORGANIZATION_ERASURE", status: "REQUESTED" },
      });
    } catch {
      return err({ type: "ERASURE_FAILED" });
    }
    return ok(created.value);
  }

  private async purgeTenantScope(tenantId: string): Promise<Result<void, PrivacyError>> {
    if (env.TENANCY_MODE !== "multi") {
      const notes = await this.purgeNotes.execute();
      if (notes.isErr()) return err({ type: "ERASURE_FAILED" });
      const files = await this.purgeFiles.execute();
      if (files.isErr()) return err({ type: "ERASURE_FAILED" });
      return ok(undefined);
    }
    return this.tenantContext.run({ mode: "multi", tenantId }, async () => {
      const notes = await this.purgeNotes.execute();
      if (notes.isErr()) return err({ type: "ERASURE_FAILED" });
      const files = await this.purgeFiles.execute();
      if (files.isErr()) return err({ type: "ERASURE_FAILED" });
      return ok(undefined);
    });
  }
}
