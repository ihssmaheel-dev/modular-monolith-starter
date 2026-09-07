import { Injectable, Optional } from "@nestjs/common";
import { ok, err, Result } from "neverthrow";
import { FilesRepository } from "../../infrastructure/files.repository";
import { FileEntity } from "../../domain/entities/file.entity";
import type { FileError } from "../../domain/errors/file.errors";
import type { AuthenticatedUser } from "@repo/contracts";
import { StorageService } from "../../../../infrastructure/storage/storage.service";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { AuthorizationService } from "../../../../infrastructure/authorization";
import { canAccessResource } from "../../../../common/utils/resource-authorization";

@Injectable()
export class ConfirmUploadCommand {
  constructor(
    private readonly filesRepo: FilesRepository,
    private readonly storage: StorageService,
    @Optional() private readonly database?: DatabaseService,
    @Optional() private readonly authorization?: AuthorizationService,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  async execute(fileKey: string, actor: AuthenticatedUser): Promise<Result<FileEntity, FileError>> {
    const file = this.database
      ? await this.database.runTransaction(() => this.filesRepo.findByKey(fileKey))
      : await this.filesRepo.findByKey(fileKey);

    if (
      !file ||
      !canAccessResource(
        this.authorization,
        this.tenantContext,
        actor,
        "files:upload",
        "file",
        file,
      )
    ) {
      return err({
        type: "FILE_NOT_FOUND",
        message: "api.file.notFound",
      });
    }

    if (file.status !== "pending")
      return err({ type: "UPLOAD_FAILED", message: "api.error.uploadFailed" });

    const metadata = await this.storage.getMetadata(file.key);
    if (metadata.isErr() || !this.matches(file, metadata.value)) {
      return err({ type: "METADATA_MISMATCH", message: "api.file.metadataMismatch" });
    }

    const update = () => this.filesRepo.updateById(file.id, { status: "uploading" });
    const updateResult = this.database
      ? await this.database.withResultTransaction(update)
      : await update();

    if (updateResult.isErr() || !updateResult.value) {
      return err({
        type: "UPLOAD_FAILED",
        message: "api.error.uploadFailed",
      });
    }

    return ok(updateResult.value);
  }

  private matches(file: FileEntity, metadata: { size: number; contentType?: string } | null) {
    return (
      metadata !== null &&
      metadata.size === file.fileSize &&
      metadata.contentType === file.contentType
    );
  }
}
