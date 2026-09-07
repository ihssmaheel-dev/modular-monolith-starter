import { Injectable, Optional } from "@nestjs/common";
import { ok, err, Result } from "neverthrow";
import { FilesRepository } from "../../infrastructure/files.repository";
import { FileEntity } from "../../domain/entities/file.entity";
import type { FileError } from "../../domain/errors/file.errors";
import type { AuthenticatedUser } from "@repo/contracts";
import { DatabaseService, type TransactionError } from "../../../../infrastructure/database";

export interface LinkFileParent {
  parentType: FileEntity["parentType"];
  parentId?: string;
  slot?: string;
}

/**
 * Generic link primitive: attach an already-uploaded file to a parent entity.
 * Ownership of the FILE is verified here; ownership of the PARENT must be
 * verified by the calling module before invoking this command.
 */
@Injectable()
export class LinkFileCommand {
  constructor(
    private readonly filesRepo: FilesRepository,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(
    fileId: string,
    parent: LinkFileParent,
    actor: AuthenticatedUser,
  ): Promise<Result<FileEntity, FileError | TransactionError>> {
    const operation = async (): Promise<Result<FileEntity, FileError>> => {
      const found = await this.filesRepo.findById(fileId);
      if (found.isErr() || !found.value) {
        return err({ type: "FILE_NOT_FOUND", message: "api.file.notFound" });
      }
      const file = found.value;
      if (file.uploadedBy !== actor.sub) {
        return err({ type: "UNAUTHORIZED", message: "api.error.unauthorized" });
      }
      if (file.status === "failed") {
        return err({ type: "UPLOAD_FAILED", message: "api.error.uploadFailed" });
      }
      if (file.status !== "uploaded") {
        return err({ type: "UPLOAD_IN_PROGRESS", message: "api.error.uploadFailed" });
      }
      const update: Record<string, unknown> = { parentType: parent.parentType };
      if (parent.parentType === "general") {
        update.parentId = null;
        update.slot = null;
      } else {
        if (parent.parentId) update.parentId = parent.parentId;
        update.slot = parent.slot ?? null;
      }
      const linked = await this.filesRepo.updateById(fileId, update);
      if (linked.isErr() || !linked.value) {
        return err({ type: "FILE_NOT_FOUND", message: "api.file.notFound" });
      }
      return ok(linked.value);
    };
    if (!this.database) return operation();
    return this.database.withResultTransaction(operation);
  }
}
