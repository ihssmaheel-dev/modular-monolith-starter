import { Injectable } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import { User } from "../../domain/entities/user.entity";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { hashSha256Token } from "../../../../infrastructure/security/token.utils";

import type { InvalidEmailChangeToken } from "../../domain/errors/user.errors";

/**
 * Applies a pending email change by token possession (H07): whoever holds
 * the single-use link proves control of the replacement address. The apply
 * is one atomic UPDATE that sets the address, marks it verified, clears the
 * pending state, and bumps authVersion — revoking every session, since the
 * login identity just changed out from under them.
 */
@Injectable()
export class VerifyEmailChangeCommand {
  constructor(private readonly repository: UsersRepository) {}

  async execute(token: string): Promise<Result<User, InvalidEmailChangeToken>> {
    const user = await this.repository.applyEmailChangeByToken(hashSha256Token(token));
    if (user.isErr()) return err(user.error);
    if (!user.value) return err({ type: "INVALID_EMAIL_CHANGE_TOKEN" });
    return ok(user.value);
  }
}
