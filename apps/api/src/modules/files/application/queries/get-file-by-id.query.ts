import { Injectable, Optional } from "@nestjs/common";
import { ok, err, Result } from "neverthrow";
import { FilesRepository } from "../../infrastructure/repositories/files.repository";
import { FileEntity } from "../../domain/entities/file.entity";
import type { FileError } from "../../domain/errors/file.errors";
import type { AuthenticatedUser } from "@repo/contracts";
import { AuthorizationService } from "../../../../infrastructure/authorization";
import { TenantContextService } from "../../../../infrastructure/database";
import { canAccessResource } from "../../../../common/utils/resource-authorization";

@Injectable()
export class GetFileByIdQuery {
  constructor(
    private readonly filesRepo: FilesRepository,
    @Optional() private readonly authorization?: AuthorizationService,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  async execute(fileId: string, actor: AuthenticatedUser): Promise<Result<FileEntity, FileError>> {
    const findResult = await this.filesRepo.findById(fileId);

    if (findResult.isErr() || !findResult.value) {
      return err({
        type: "FILE_NOT_FOUND",
        message: "api.file.notFound",
      });
    }

    if (
      !canAccessResource(
        this.authorization,
        this.tenantContext,
        actor,
        "files:read",
        "file",
        findResult.value,
      )
    ) {
      return err({
        type: "FILE_NOT_FOUND",
        message: "api.file.notFound",
      });
    }

    return ok(findResult.value);
  }
}
