import { Injectable, Optional } from "@nestjs/common";
import { ok, err, Result } from "neverthrow";
import { StorageService } from "../../../../infrastructure/storage/storage.service";
import { env } from "../../../../config/env";
import { FilesRepository } from "../../infrastructure/repositories/files.repository";
import type { FileError } from "../../domain/errors/file.errors";
import { API_BASE_PATH, type AuthenticatedUser } from "@repo/contracts";
import { AuthorizationService } from "../../../../infrastructure/authorization";
import { TenantContextService } from "../../../../infrastructure/database";
import { canAccessResource } from "../../../../common/utils/resource-authorization";
import { DatabaseService } from "../../../../infrastructure/database";
import { FileAccessRegistry } from "../../../../common/file-access/file-access.registry";

interface DownloadUrlResult {
  downloadUrl: string;
}

@Injectable()
export class GetFileDownloadUrlQuery {
  constructor(
    private readonly storage: StorageService,
    private readonly filesRepo: FilesRepository,
    @Optional() private readonly database?: DatabaseService,
    @Optional() private readonly authorization?: AuthorizationService,
    @Optional() private readonly tenantContext?: TenantContextService,
    @Optional() private readonly accessRegistry?: FileAccessRegistry,
  ) {}

  async execute(
    fileId: string,
    actor: AuthenticatedUser,
  ): Promise<Result<DownloadUrlResult, FileError>> {
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
      !canAccessResource(this.authorization, this.tenantContext, actor, "files:read", "file", file)
    ) {
      return err({ type: "FILE_NOT_FOUND", message: "api.file.notFound" });
    }
    if (file.status !== "uploaded") {
      return err({ type: "FILE_NOT_FOUND", message: "api.file.notFound" });
    }
    // Parent-controlled attachments (anything linked to a domain entity)
    // inherit the parent's readability, checked live against the owning
    // domain. Unlinked or general files stay tenant-shared; unknown parent
    // types are denied until their domain registers a checker. Without a
    // registry (standalone/test compositions) the legacy files:read policy
    // above remains the boundary.
    if (file.parentType !== "general" && file.parentId && this.accessRegistry) {
      const checker = this.accessRegistry?.getChecker(file.parentType);
      if (!checker) {
        return err({ type: "FILE_NOT_FOUND", message: "api.file.notFound" });
      }
      let allowed = false;
      try {
        allowed = await checker(file, actor);
      } catch {
        allowed = false;
      }
      if (!allowed) {
        return err({ type: "FILE_NOT_FOUND", message: "api.file.notFound" });
      }
    }
    if (!this.storage.usesDirectTransfer()) {
      return ok({
        downloadUrl: new URL(`${API_BASE_PATH}/files/${file.id}/content`, env.API_URL).toString(),
      });
    }
    const urlResult = await this.storage.getPresignedDownloadUrl(file.key);

    if (urlResult.isErr()) {
      return err({
        type: "PRESIGN_FAILED",
        message: "api.error.presignFailed",
      });
    }

    return ok({ downloadUrl: urlResult.value });
  }
}
