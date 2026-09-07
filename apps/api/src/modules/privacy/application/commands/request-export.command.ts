import { Injectable, Optional } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { err, ok, Result } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";
import { env } from "../../../../config/env";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { GetUserByIdQuery } from "../../../users/application/queries/get-user-by-id.query";
import { ListOrganizationsQuery } from "../../../tenancy/application/queries/list-organizations.query";
import { ListInvitationsByEmailQuery } from "../../../tenancy/application/queries/list-invitations-by-email.query";
import { GetNotesQuery } from "../../../notes/application/queries/get-notes.query";
import { ListFilesByUploaderQuery } from "../../../files/application/queries/list-files-by-uploader.query";
import { DsrRequest } from "../../domain/entities/dsr.entity";
import type { PrivacyError } from "../../domain/errors/privacy.errors";
import { ExportReadyEvent } from "../../domain/events/privacy.events";
import { PrivacyRepository } from "../../infrastructure/privacy.repository";

const EXPORT_PAGE_LIMIT = 100;
const EXPORT_MAX_ITEMS = 1000;
const EXPORT_TTL_DAYS = 7;

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
    private readonly getNotes: GetNotesQuery,
    private readonly listFilesByUploader: ListFilesByUploaderQuery,
    private readonly tenantContext: TenantContextService,
    private readonly outbox: OutboxService,
    private readonly events: EventEmitter2,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(actor: AuthenticatedUser): Promise<Result<DsrRequest, PrivacyError>> {
    const operation = () => this.persist(actor);
    if (!this.database) return operation();
    const result = await this.database.withResultTransaction(operation);
    return result.mapErr((error) =>
      error.type === "TRANSACTION_FAILED" ? { type: "EXPORT_FAILED" } : error,
    );
  }

  private async persist(actor: AuthenticatedUser): Promise<Result<DsrRequest, PrivacyError>> {
    const userResult = await this.getUserById.execute(actor.sub);
    if (userResult.isErr()) return err({ type: "EXPORT_FAILED" });
    const user = userResult.value;

    const orgsResult = await this.listOrganizations.execute(actor, 1, EXPORT_PAGE_LIMIT);
    const accesses = orgsResult.isOk() ? orgsResult.value.items : [];
    const tenantIds = [...new Set(accesses.map((a) => a.organization.data.id))];

    const invitationsResult = await this.listInvitationsByEmail.execute(user.email);
    const invitations = invitationsResult.isOk() ? invitationsResult.value : [];

    const notes = await this.collectNotes(actor, tenantIds);
    const files = await this.collectFiles(actor.sub, tenantIds);

    const payload = {
      exportedAt: new Date().toISOString(),
      truncated: notes.truncated || files.truncated,
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
      notes: notes.items,
      files: files.items,
    };

    const expiresAt = new Date(Date.now() + EXPORT_TTL_DAYS * 24 * 60 * 60 * 1000);
    const created = await this.requests.create({
      type: "EXPORT",
      status: "READY",
      subjectUserId: actor.sub,
      payload,
      expiresAt,
    });
    if (created.isErr()) return err({ type: "EXPORT_FAILED" });

    const dispatched = await this.outbox.dispatchGlobal(
      "privacy.export.ready",
      new ExportReadyEvent(created.value.id, actor.sub),
    );
    if (dispatched.isErr()) return err({ type: "EXPORT_FAILED" });

    try {
      await this.events.emitAsync("database.mutated", {
        collectionName: "dsr_requests",
        documentId: created.value.id,
        action: "CREATE",
        actorId: actor.sub,
        tenantId: undefined,
        before: null,
        after: { id: created.value.id, type: "EXPORT", status: "READY" },
      });
    } catch {
      return err({ type: "EXPORT_FAILED" });
    }
    return ok(created.value);
  }

  private async collectNotes(actor: AuthenticatedUser, tenantIds: string[]) {
    const items: Array<Record<string, unknown>> = [];
    let truncated = false;
    const scopes = env.TENANCY_MODE === "multi" && tenantIds.length > 0 ? tenantIds : [undefined];
    for (const tenantId of scopes) {
      const run =
        tenantId !== undefined
          ? () =>
              this.tenantContext.run({ mode: "multi", tenantId }, () =>
                this.getNotes.execute({ page: 1, limit: EXPORT_PAGE_LIMIT }, actor),
              )
          : () => this.getNotes.execute({ page: 1, limit: EXPORT_PAGE_LIMIT }, actor);
      const result = await run();
      if (result.isErr()) continue;
      for (const note of result.value.items) {
        if (items.length >= EXPORT_MAX_ITEMS) {
          truncated = true;
          break;
        }
        items.push({
          id: note.id,
          title: note.title,
          content: note.content,
          tenantId: note.tenantId ?? null,
          createdAt: toIso(note.createdAt),
          updatedAt: toIso(note.updatedAt),
        });
      }
      if (truncated) break;
    }
    return { items, truncated };
  }

  private async collectFiles(userId: string, tenantIds: string[]) {
    const items: Array<Record<string, unknown>> = [];
    let truncated = false;
    const scopes = env.TENANCY_MODE === "multi" && tenantIds.length > 0 ? tenantIds : [undefined];
    for (const tenantId of scopes) {
      const run =
        tenantId !== undefined
          ? () =>
              this.tenantContext.run({ mode: "multi", tenantId }, () =>
                this.listFilesByUploader.execute(userId, EXPORT_MAX_ITEMS),
              )
          : () => this.listFilesByUploader.execute(userId, EXPORT_MAX_ITEMS);
      const result = await run();
      if (result.isErr()) continue;
      for (const file of result.value) {
        if (items.length >= EXPORT_MAX_ITEMS) {
          truncated = true;
          break;
        }
        items.push({
          id: file.id,
          fileName: file.fileName,
          contentType: file.contentType,
          fileSize: file.fileSize,
          tenantId: file.tenantId ?? null,
          slot: file.slot ?? null,
          createdAt: toIso(file.createdAt),
        });
      }
      if (truncated) break;
    }
    return { items, truncated };
  }
}
