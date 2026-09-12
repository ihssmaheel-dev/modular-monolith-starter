import { Injectable } from "@nestjs/common";
import { ok, err, Result } from "neverthrow";
import { verify } from "@node-rs/argon2";
import { User } from "../../domain/entities/user.entity";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { GetUserByIdQuery } from "./get-user-by-id.query";

@Injectable()
export class VerifyUserCredentialsQuery {
  constructor(
    private readonly repository: UsersRepository,
    private readonly getUserById: GetUserByIdQuery,
  ) {}

  async execute(email: string, password: string): Promise<Result<User | null, never>> {
    const result = await this.repository.findByEmailWithPassword(email);
    if (result.isErr()) return err(result.error);
    if (!result.value) return ok(null);

    const passwordValid = await verify(result.value.passwordHash, password);
    if (!passwordValid) return ok(null);

    const userResult = await this.getUserById.execute(result.value.id);
    if (userResult.isErr()) return ok(null);
    return ok(userResult.value);
  }
}
