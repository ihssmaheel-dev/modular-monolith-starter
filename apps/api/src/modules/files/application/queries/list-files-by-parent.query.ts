import { Injectable, Optional } from "@nestjs/common";
import { Result } from "neverthrow";
import { FilesRepository } from "../../infrastructure/files.repository";
import { FileEntity } from "../../domain/entities/file.entity";
import type { AuthenticatedUser } from "@repo/contracts";
import type { PaginatedResult } from "../../../../infrastructure/database";
import { AuthorizationService } from "../../../../infrastructure/authorization";
import { TenantContextService } from "../../../../infrastructure/database";
import { canListTenantResources } from "../../../../common/utils/resource-authorization";

@Injectable()
export class ListFilesByParentQuery {
  constructor(
    private readonly filesRepo: FilesRepository,
    @Optional() private readonly authorization?: AuthorizationService,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  async execute(
    parentType: string,
    actor: AuthenticatedUser,
    parentId?: string,
    page = 1,
    limit = 20,
    slot?: string,
  ): Promise<Result<PaginatedResult<FileEntity>, never>> {
    const filter: Record<string, string> = { parentType };
    if (parentId) filter.parentId = parentId;
    if (slot) filter.slot = slot;
    if (!canListTenantResources(this.authorization, this.tenantContext, actor, "files:read")) {
      filter.uploadedBy = actor.sub;
    }
    return this.filesRepo.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
    });
  }
}
