import { Injectable, Optional } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  AVATAR_MIME_TYPES,
  AVATAR_SLOT,
  type AuthenticatedUser,
  type FileErrorType as FileError,
  type FileRecord as FileEntity,
} from "@repo/contracts";
import { DatabaseService, type TransactionError } from "../../../../infrastructure/database";
import { DeleteFileCommand } from "../../../files/application/commands/delete-file.command";
import { GetFileByIdQuery } from "../../../files/application/queries/get-file-by-id.query";
import { LinkFileCommand } from "../../../files/application/commands/link-file.command";

import { User } from "../../domain/entities/user.entity";
import { InvalidAvatarFile, UserNotFound } from "../../domain/errors/user.errors";
import { UsersRepository } from "../../infrastructure/users.repository";
import { GetUserByIdQuery } from "../queries/get-user-by-id.query";

/**
 * Self-serve profile avatar (Option B reference): link an uploaded image as
 * the user's `avatar` slot and store its id on `users.avatar_file_id` in one
 * transaction. Single-photo replace: a previous avatar is deleted first.
 * Avatars are images only (see AVATAR_MIME_TYPES / AVATAR_MAX_FILE_SIZE_BYTES).
 */
@Injectable()
export class AttachUserAvatarCommand {
  constructor(
    private readonly getUserById: GetUserByIdQuery,
    private readonly getFileById: GetFileByIdQuery,
    private readonly linkFile: LinkFileCommand,
    private readonly deleteFile: DeleteFileCommand,
    private readonly users: UsersRepository,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    fileId: string,
  ): Promise<Result<User, UserNotFound | InvalidAvatarFile | FileError | TransactionError>> {
    const operation = (): Promise<
      Result<User, UserNotFound | InvalidAvatarFile | FileError | TransactionError>
    > => this.persist(actor, fileId);
    if (!this.database) return operation();
    return this.database.withResultTransaction(operation);
  }

  private async persist(
    actor: AuthenticatedUser,
    fileId: string,
  ): Promise<Result<User, UserNotFound | InvalidAvatarFile | FileError | TransactionError>> {
    const userResult = await this.getUserById.execute(actor.sub);
    if (userResult.isErr()) return err(userResult.error);
    const user = userResult.value;

    const fileResult = await this.getFileById.execute(fileId, actor);
    if (fileResult.isErr()) return err(fileResult.error);
    const file = fileResult.value;
    if (!isAvatarUploadable(file, actor.sub)) return err({ type: "INVALID_AVATAR_FILE" });

    const previousId = user.avatarFileId;
    const linked = await this.linkFile.execute(
      fileId,
      { parentType: "user", parentId: user.id, slot: AVATAR_SLOT },
      actor,
    );
    if (linked.isErr()) return err(linked.error);

    user.setAvatar(linked.value.id);
    const saved = await this.users.updateById(user.id, { avatarFileId: linked.value.id });
    if (saved.isErr() || !saved.value) return err({ type: "USER_NOT_FOUND", userId: user.id });

    if (previousId && previousId !== linked.value.id) {
      const removed = await this.deleteFile.execute(previousId, actor);
      if (removed.isErr()) return err(removed.error);
    }
    return ok(saved.value);
  }
}

function isAvatarUploadable(file: FileEntity, userId: string): boolean {
  if (file.uploadedBy !== userId) return false;
  if (file.status === "failed") return false;
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.contentType)) return false;
  return file.fileSize > 0 && file.fileSize <= AVATAR_MAX_FILE_SIZE_BYTES;
}
