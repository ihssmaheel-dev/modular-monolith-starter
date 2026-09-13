import { Injectable } from "@nestjs/common";
import type { AuthUserVerifierPort } from "../../../../common/ports/auth-user-verifier.port";
import { GetUserByIdQuery } from "../queries/get-user-by-id.query";

@Injectable()
export class UsersAuthVerifierAdapter implements AuthUserVerifierPort {
  constructor(private readonly getUserById: GetUserByIdQuery) {}

  async verifyUserAuthVersion(
    userId: string,
    expectedVersion?: number,
  ): Promise<{ valid: boolean }> {
    const current = await (this.getUserById.executeFresh?.(userId) ??
      this.getUserById.execute(userId));
    if (current.isErr()) return { valid: false };
    if (expectedVersion !== undefined && current.value.authVersion !== expectedVersion) {
      return { valid: false };
    }
    return { valid: true };
  }
}
