import { Injectable, Optional } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import type { UserNotFound } from "../../domain/errors/user.errors";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { DatabaseService } from "../../../../infrastructure/database";

@Injectable()
export class SetPasswordResetTokenCommand {
  constructor(
    private readonly repository: UsersRepository,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<Result<void, UserNotFound>> {
    const update = () => this.repository.setPasswordResetToken(userId, tokenHash, expiresAt);
    const result = this.database
      ? await this.database.withResultTransaction(update)
      : await update();
    if (result.isErr() || !result.value) return err({ type: "USER_NOT_FOUND", userId });
    return ok(undefined);
  }
}
