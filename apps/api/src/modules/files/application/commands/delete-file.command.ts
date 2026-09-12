import { Injectable, Optional } from "@nestjs/common";
import { ok, err, Result } from "neverthrow";
import { StorageService } from "../../../../infrastructure/storage/storage.service";
import { FilesRepository } from "../../infrastructure/repositories/files.repository";
import type { FileError } from "../../domain/errors/file.errors";
import type { AuthenticatedUser } from "@repo/contracts";
import { DatabaseService } from "../../../../infrastructure/database";
import { AuthorizationService } from "../../../../infrastructure/authorization";
import { TenantContextService } from "../../../../infrastructure/database";
import { canAccessResource } from "../../../../common/utils/resource-authorization";
import { deleteFileObjects } from "../services/file-objects.service";

@Injectable()
export class DeleteFileCommand {
  constructor(
    private readonly storage: StorageService,
    private readonly filesRepo: FilesRepository,
    @Optional() private readonly database?: DatabaseService,
    @Optional() private readonly authorization?: AuthorizationService,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  async execute(fileId: string, actor: AuthenticatedUser): Promise<Result<void, FileError>> {
    const findResult = this.database
      ? await this.database.runTransaction(() => this.filesRepo.findById(fileId))
      : await this.filesRepo.findById(fileId);

    if (findResult.isErr() || !findResult.value) {
      return err({
        type: "FILE_NOT_FOUND",
        message: "api.file.notFound",
      });
    }

    const file = findResult.value;

    if (
      !canAccessResource(
        this.authorization,
        this.tenantContext,
        actor,
        "files:delete",
        "file",
        file,
      )
    ) {
      return err({
        type: "UNAUTHORIZED",
        message: "api.error.unauthorized",
      });
    }

    const markDeleted = () => this.filesRepo.softDeleteById(fileId);
    const deleteResult = this.database
      ? await this.database.withResultTransaction(markDeleted)
      : await markDeleted();
    if (deleteResult.isErr() || !deleteResult.value) {
      return err({
        type: "DELETE_FAILED",
        message: "api.error.deleteFailed",
      });
    }

    const storageResult = await deleteFileObjects(this.storage, file.key);
    if (storageResult.isErr()) {
      return err({ type: "DELETE_FAILED", message: "api.error.deleteFailed" });
    }

    return ok(undefined);
  }
}
