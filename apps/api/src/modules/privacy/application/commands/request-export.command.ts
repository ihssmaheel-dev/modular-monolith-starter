import { Injectable, Optional } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { err, ok, Result } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";
import { DatabaseService } from "../../../../infrastructure/database";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { GetUserByIdQuery } from "../../../users/application/queries/get-user-by-id.query";
import { ListOrganizationsQuery } from "../../../tenancy/application/queries/list-organizations.query";
import { ListInvitationsByEmailQuery } from "../../../tenancy/application/queries/list-invitations-by-email.query";
import { DataLifecycleRegistry } from "../../../../infrastructure/lifecycle/data-lifecycle.registry";
import { FeatureFlagsService } from "../../../../infrastructure/feature-flags";
import { DsrRequest } from "../../domain/entities/dsr.entity";
import type { PrivacyError } from "../../domain/errors/privacy.errors";
import { ExportReadyEvent, ExportRequestedEvent } from "../../domain/events/privacy.events";
import { PrivacyRepository } from "../../infrastructure/repositories/privacy.repository";

const EXPORT_PAGE_LIMIT = 100;
const EXPORT_TTL_DAYS = 7;
const EXPORT_REQUEST_TTL_HOURS = 24;
const EXPORT_MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;

function toIso(value: Date): string {
  return value.toISOString();
}

/** GDPR Art. 15/20: assemble a machine-readable copy of a subject's data. */
@Injectable()
export class RequestExportCommand {
  constructor(
    private readonly requests: PrivacyRepository,
    private readonly getUserById: GetUserByIdQuery,
    private readonly listOrganizations: ListOrganizationsQuery,
    private readonly listInvitationsByEmail: ListInvitationsByEmailQuery,
    private readonly lifecycle: DataLifecycleRegistry,
    private readonly outbox: OutboxService,
    private readonly events: EventEmitter2,
    @Optional() private readonly database?: DatabaseService,
    @Optional() private readonly featureFlags?: FeatureFlagsService,
  ) {}

  async execute(actor: AuthenticatedUser): Promise<Result<DsrRequest, PrivacyError>> {
    if (this.featureFlags?.isEnabled("admission.stop.privacy-exports")) {
      return err({ type: "EXPORT_ADMISSION_DISABLED" });
    }
    const operation = () => this.enqueue(actor);
    if (!this.database) return operation();
    const result = await this.database.withResultTransaction(() =>
      this.database!.withAdvisoryLock(`privacy:export:${actor.sub}`, operation),
    );
    return result.mapErr((error) =>
      error.type === "TRANSACTION_FAILED" ? { type: "EXPORT_FAILED" } : error,
    );
  }

  async process(request: DsrRequest): Promise<Result<DsrRequest, PrivacyError>> {
    const userResult = await this.systemQuery(() =>
      this.getUserById.execute(request.subjectUserId),
    );
    if (userResult.isErr()) return err({ type: "EXPORT_FAILED" });
    const user = userResult.value;
    const actor = { sub: user.id, email: user.email, role: user.role } as AuthenticatedUser;

    const accessesResult = await this.collectAccesses(actor);
    if (accessesResult.isErr()) return err(accessesResult.error);
    const accesses = accessesResult.value;
    const tenantIds = [...new Set(accesses.map((a) => a.organization.data.id))];

    const invitationsResult = await this.systemQuery(() =>
      this.listInvitationsByEmail.execute(user.email),
    );
    if (invitationsResult.isErr()) return err({ type: "EXPORT_FAILED" });
    const invitations = invitationsResult.value;
    const contributed = await this.lifecycle.exportSubject({ actor, tenantIds });
    if (contributed.isErr()) return err({ type: "EXPORT_FAILED" });

    const payload = {
      exportedAt: new Date().toISOString(),
      truncated: contributed.value.truncated,
      profile: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: toIso(user.createdAt),
        updatedAt: toIso(user.updatedAt),
      },
      memberships: accesses.map((a) => ({
        organizationId: a.organization.data.id,
        organizationName: a.organization.data.name,
        role: a.role,
      })),
      invitations: invitations.map((inv) => ({
        organizationId: inv.data.tenantId,
        email: inv.data.email,
        role: inv.data.role,
        status: inv.data.status,
      })),
      modules: contributed.value.data,
    };

    if (Buffer.byteLength(JSON.stringify(payload), "utf8") > EXPORT_MAX_PAYLOAD_BYTES) {
      return err({ type: "EXPORT_FAILED" });
    }

    const expiresAt = new Date(Date.now() + EXPORT_TTL_DAYS * 24 * 60 * 60 * 1000);
    return this.complete(request, payload, contributed.value.truncated, expiresAt);
  }

  private async enqueue(actor: AuthenticatedUser): Promise<Result<DsrRequest, PrivacyError>> {
    const active = await this.requests.findActiveExportForSubject(actor.sub);
    if (active) return ok(active);
    const expiresAt = new Date(Date.now() + EXPORT_REQUEST_TTL_HOURS * 60 * 60 * 1000);
    const created = await this.requests.create({
      type: "EXPORT",
      status: "REQUESTED",
      subjectUserId: actor.sub,
      expiresAt,
    });
    if (created.isErr()) return err({ type: "EXPORT_FAILED" });
    const dispatched = await this.outbox.dispatchGlobal(
      "privacy.export.requested",
      new ExportRequestedEvent(created.value.id, actor.sub),
    );
    if (dispatched.isErr()) return err({ type: "EXPORT_FAILED" });
    await this.emitMutated({
      collectionName: "dsr_requests",
      documentId: created.value.id,
      action: "CREATE",
      actorId: actor.sub,
      tenantId: undefined,
      before: null,
      after: { id: created.value.id, type: "EXPORT", status: "REQUESTED" },
    });
    return ok(created.value);
  }

  private async complete(
    request: DsrRequest,
    payload: unknown,
    truncated: boolean,
    expiresAt: Date,
  ): Promise<Result<DsrRequest, PrivacyError>> {
    const operation = async (): Promise<Result<DsrRequest, PrivacyError>> => {
      const updated = await this.requests.completeExport(request.id, payload, truncated, expiresAt);
      if (updated.isErr() || !updated.value) return err({ type: "EXPORT_FAILED" });
      const dispatched = await this.outbox.dispatchGlobal(
        "privacy.export.ready",
        new ExportReadyEvent(request.id, request.subjectUserId),
      );
      if (dispatched.isErr()) return err({ type: "EXPORT_FAILED" });
      await this.emitMutated({
        collectionName: "dsr_requests",
        documentId: request.id,
        action: "UPDATE",
        actorId: request.subjectUserId,
        tenantId: undefined,
        before: { id: request.id, status: "PROCESSING" },
        after: { id: request.id, status: truncated ? "PARTIAL" : "READY" },
      });
      return ok(updated.value);
    };
    if (!this.database) return operation();
    const result = await this.database.withResultTransaction(operation);
    return result.mapErr(() => ({ type: "EXPORT_FAILED" }));
  }

  private async emitMutated(payload: Record<string, unknown>): Promise<void> {
    if (this.database) {
      await this.database.emitAfterCommit(this.events, "database.mutated", payload);
      return;
    }
    await this.events.emitAsync("database.mutated", payload);
  }

  private async collectAccesses(
    actor: AuthenticatedUser,
  ): Promise<
    Result<
      Array<{ organization: { data: { id: string; name: string } }; role: string }>,
      PrivacyError
    >
  > {
    const accesses: Array<{ organization: { data: { id: string; name: string } }; role: string }> =
      [];
    let page = 1;
    for (;;) {
      const result = await this.systemQuery(() =>
        this.listOrganizations.execute(actor, page, EXPORT_PAGE_LIMIT),
      );
      if (result.isErr()) return err({ type: "EXPORT_FAILED" });
      for (const access of result.value.items) {
        accesses.push({
          organization: {
            data: { id: access.organization.data.id, name: access.organization.data.name },
          },
          role: access.role,
        });
      }
      if (page >= result.value.totalPages) break;
      page += 1;
    }
    return ok(accesses);
  }

  private systemQuery<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.database) return operation();
    return this.database.withSystemScope(() => this.database!.runTransaction(operation));
  }
}
