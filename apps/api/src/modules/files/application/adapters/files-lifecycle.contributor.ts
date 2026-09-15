import { Injectable } from "@nestjs/common";
import { err, ok } from "neverthrow";

import type {
  DataLifecycleContributor,
  LifecycleFailure,
  SubjectLifecycleContext,
} from "../../../../infrastructure/lifecycle/data-lifecycle.types";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { PurgeTenantFilesCommand } from "../commands/purge-tenant-files.command";
import { PurgeUserFilesCommand } from "../commands/purge-user-files.command";
import { FilesRepository } from "../../infrastructure/repositories/files.repository";

const EXPORT_MAX_ITEMS = 1_000;

@Injectable()
export class FilesLifecycleContributor implements DataLifecycleContributor {
  readonly key = "files";

  constructor(
    private readonly files: FilesRepository,
    private readonly purgeUser: PurgeUserFilesCommand,
    private readonly purgeOrganization: PurgeTenantFilesCommand,
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async exportSubject(context: SubjectLifecycleContext) {
    const items: Array<Record<string, unknown>> = [];
    let truncated = false;
    for (const tenantId of this.scopes(context.tenantIds)) {
      const rows = await this.scoped(tenantId, () =>
        this.database.runTransaction(() =>
          this.files.findByUploader(context.actor.sub, EXPORT_MAX_ITEMS + 1),
        ),
      );
      const remaining = EXPORT_MAX_ITEMS - items.length;
      items.push(...rows.slice(0, remaining).map(toExport));
      truncated ||= rows.length > remaining;
      if (items.length >= EXPORT_MAX_ITEMS) break;
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
    return tenantId ? this.database.withTenantScope(tenantId, operation) : operation();
  }

  private failed(): LifecycleFailure {
    return { type: "LIFECYCLE_CONTRIBUTOR_FAILED", contributor: this.key };
  }
}

function toExport(file: {
  id: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  tenantId?: string;
  slot?: string | null;
  createdAt: Date;
}) {
  return {
    id: file.id,
    fileName: file.fileName,
    contentType: file.contentType,
    fileSize: file.fileSize,
    tenantId: file.tenantId ?? null,
    slot: file.slot ?? null,
    createdAt: file.createdAt.toISOString(),
  };
}
