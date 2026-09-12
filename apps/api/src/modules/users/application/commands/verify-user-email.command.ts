import { Injectable, Optional } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import type { InvalidVerificationToken } from "../../domain/errors/user.errors";
import type { User } from "../../domain/entities/user.entity";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { DatabaseService } from "../../../../infrastructure/database";

@Injectable()
export class VerifyUserEmailCommand {
  constructor(
    private readonly repository: UsersRepository,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(tokenHash: string): Promise<Result<User | null, InvalidVerificationToken>> {
    const consume = () => this.repository.verifyEmailByToken(tokenHash);
    const result = this.database
      ? await this.database.withResultTransaction(consume)
      : await consume();
    if (result.isErr() || !result.value) return err({ type: "INVALID_VERIFICATION_TOKEN" });
    return ok(result.value);
  }
}
