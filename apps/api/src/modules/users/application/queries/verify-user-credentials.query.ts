import { Injectable } from "@nestjs/common";
import { ok, err, Result } from "neverthrow";
import { verify } from "@node-rs/argon2";
import { User } from "../../domain/entities/user.entity";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { GetUserByIdQuery } from "./get-user-by-id.query";

// A fixed valid Argon2id hash keeps the missing-account path equivalent to
// the existing-account path without creating per-request startup work.
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$iD2QwPY/VlkWMIJf83VrSg$//0VZk6X3rG/5u1ZGP4o0FPYdtyjd0X/z5Sw5adxZH4";

@Injectable()
export class VerifyUserCredentialsQuery {
  constructor(
    private readonly repository: UsersRepository,
    private readonly getUserById: GetUserByIdQuery,
  ) {}

  async execute(email: string, password: string): Promise<Result<User | null, never>> {
    const result = await this.repository.findByEmailWithPassword(email);
    if (result.isErr()) return err(result.error);
    const credentials = result.value;
    const passwordValid = await verify(credentials?.passwordHash ?? DUMMY_PASSWORD_HASH, password);
    if (!credentials || !passwordValid) return ok(null);

    const userResult = await this.getUserById.executeFresh(credentials.id);
    if (userResult.isErr()) return ok(null);
    return ok(userResult.value);
  }
}
