import { Injectable } from "@nestjs/common";
import { Result } from "neverthrow";
import { FilesRepository } from "../../infrastructure/repositories/files.repository";
import { FileEntity } from "../../domain/entities/file.entity";
import type { AuthenticatedUser } from "@repo/contracts";
import type { PaginatedResult } from "../../../../infrastructure/database";

@Injectable()
export class ListFilesByParentQuery {
  constructor(private readonly filesRepo: FilesRepository) {}

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
    if (actor.role !== "admin") filter.uploadedBy = actor.sub;
    return this.filesRepo.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
    });
  }

  async executeForVerifiedParent(
    parentType: string,
    parentId: string,
    page = 1,
    limit = 20,
    slot?: string,
  ): Promise<Result<PaginatedResult<FileEntity>, never>> {
    const filter: Record<string, string> = { parentType, parentId };
    if (slot) filter.slot = slot;
    return this.filesRepo.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
    });
  }
}
