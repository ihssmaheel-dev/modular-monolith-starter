import { Injectable, Optional } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import type { AuthenticatedUser, FileErrorType as FileError } from "@repo/contracts";
import { DatabaseService, type TransactionError } from "../../../../infrastructure/database";
import { DeleteFileCommand } from "../../../files/application/commands/delete-file.command";

import { User } from "../../domain/entities/user.entity";
import { UserNotFound } from "../../domain/errors/user.errors";
import { UsersRepository } from "../../infrastructure/users.repository";
import { GetUserByIdQuery } from "../queries/get-user-by-id.query";

/** Self-serve avatar removal: clear the reference column and delete the file. Idempotent. */
@Injectable()
export class RemoveUserAvatarCommand {
  constructor(
    private readonly getUserById: GetUserByIdQuery,
    private readonly deleteFile: DeleteFileCommand,
    private readonly users: UsersRepository,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(
    actor: AuthenticatedUser,
  ): Promise<Result<User, UserNotFound | FileError | TransactionError>> {
    const operation = (): Promise<Result<User, UserNotFound | FileError>> => this.persist(actor);
    if (!this.database) return operation();
    return this.database.withResultTransaction(operation);
  }

  private async persist(actor: AuthenticatedUser): Promise<Result<User, UserNotFound | FileError>> {
    const userResult = await this.getUserById.execute(actor.sub);
    if (userResult.isErr()) return err(userResult.error);
    const user = userResult.value;

    const previousId = user.avatarFileId;
    if (!previousId) return ok(user);

    user.setAvatar(null);
    const saved = await this.users.updateById(user.id, { avatarFileId: null });
    if (saved.isErr() || !saved.value) return err({ type: "USER_NOT_FOUND", userId: user.id });

    const removed = await this.deleteFile.execute(previousId, actor);
    if (removed.isErr()) return err(removed.error);
    return ok(saved.value);
  }
}
