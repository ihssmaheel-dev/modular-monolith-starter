import { Injectable, Optional } from "@nestjs/common";
import { ok, err, Result } from "neverthrow";
import { FilesRepository } from "../../infrastructure/repositories/files.repository";
import { FileEntity } from "../../domain/entities/file.entity";
import type { FileError } from "../../domain/errors/file.errors";
import type { AuthenticatedUser } from "@repo/contracts";
import { StorageService } from "../../../../infrastructure/storage/storage.service";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { AuthorizationService } from "../../../../infrastructure/authorization";
import { canAccessResource } from "../../../../common/utils/resource-authorization";
import { quarantineKeyFor } from "../../domain/value-objects/file-keys.vo";

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

    if (["uploading", "scanning", "uploaded"].includes(file.status)) return ok(file);
    if (file.status !== "pending") {
      return err({ type: "UPLOAD_FAILED", message: "api.error.uploadFailed" });
    }

    // Validate the quarantine object the browser actually uploaded, not the
    // final key (which must not exist before the scan worker promotes it).
    const metadata = await this.storage.getMetadata(quarantineKeyFor(file.key));
    if (metadata.isErr()) {
      return err({ type: "STORAGE_UNAVAILABLE", message: "api.error.serviceUnavailable" });
    }
    if (!this.matches(file, metadata.value)) {
      return err({ type: "METADATA_MISMATCH", message: "api.file.metadataMismatch" });
    }

    const update = () => this.filesRepo.markUploadReady(file.id, metadata.value ?? {});
    const updated = this.database ? await this.database.runTransaction(update) : await update();

    if (!updated) {
      const current = await this.filesRepo.findByKey(fileKey);
      if (current && ["uploading", "scanning", "uploaded"].includes(current.status)) {
        return ok(current);
      }
      return err({ type: "UPLOAD_FAILED", message: "api.error.uploadFailed" });
    }

    return ok(updated);
  }

  private matches(file: FileEntity, metadata: { size: number; contentType?: string } | null) {
    return (
      metadata !== null &&
      metadata.size === file.fileSize &&
      metadata.contentType === file.contentType
    );
  }
}
