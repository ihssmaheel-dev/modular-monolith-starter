import { Injectable } from "@nestjs/common";
import { err, ok } from "neverthrow";

import type {
  DataLifecycleContributor,
  LifecycleFailure,
  SubjectLifecycleContext,
} from "../../../../infrastructure/lifecycle/data-lifecycle.types";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { PurgeTenantNotesCommand } from "../commands/purge-tenant-notes.command";
import { PurgeUserNotesCommand } from "../commands/purge-user-notes.command";
import { GetNotesQuery } from "../queries/get-notes.query";

const EXPORT_PAGE_SIZE = 100;
const EXPORT_MAX_ITEMS = 1_000;

@Injectable()
export class NotesLifecycleContributor implements DataLifecycleContributor {
  readonly key = "notes";

  constructor(
    private readonly notes: GetNotesQuery,
    private readonly purgeUser: PurgeUserNotesCommand,
    private readonly purgeOrganization: PurgeTenantNotesCommand,
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async exportSubject(context: SubjectLifecycleContext) {
    const items: Array<Record<string, unknown>> = [];
    let truncated = false;
    for (const tenantId of this.scopes(context.tenantIds)) {
      let page = 1;
      for (;;) {
        const result = await this.scoped(tenantId, () =>
          this.notes.execute(
            { page, limit: EXPORT_PAGE_SIZE, createdBy: context.actor.sub },
            context.actor,
          ),
        );
        if (result.isErr()) return err(this.failed());
        items.push(...result.value.items.slice(0, EXPORT_MAX_ITEMS - items.length).map(toExport));
        if (items.length >= EXPORT_MAX_ITEMS) {
          truncated = page < result.value.totalPages;
          break;
        }
        if (page >= result.value.totalPages) break;
        page += 1;
      }
      if (truncated) break;
    }
    return ok({ data: { items }, truncated });
  }

  async purgeSubject(userId: string, tenantIds: string[]) {
    let deleted = 0;
    for (const tenantId of this.scopes(tenantIds)) {
      const result = await this.scoped(tenantId, () => this.purgeUser.execute(userId));
      if (result.isErr()) return err(this.failed());
      deleted += result.value.deleted;
    }
    return ok({ deleted });
  }

  async purgeTenant(tenantId: string) {
    const result = await this.scoped(tenantId, () => this.purgeOrganization.execute());
    return result.isErr() ? err(this.failed()) : ok(result.value);
  }

  private scopes(tenantIds: string[]): Array<string | undefined> {
    return this.tenantContext.get().mode === "multi" ? tenantIds : [undefined];
  }

  private scoped<T>(tenantId: string | undefined, operation: () => Promise<T>): Promise<T> {
    return tenantId
      ? this.database.withTenantScope(tenantId, operation)
      : this.database.runTransaction(operation);
  }

  private failed(): LifecycleFailure {
    return { type: "LIFECYCLE_CONTRIBUTOR_FAILED", contributor: this.key };
  }
}

function toExport(note: {
  id: string;
  title: string;
  content: string;
  tenantId?: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    tenantId: note.tenantId ?? null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}
