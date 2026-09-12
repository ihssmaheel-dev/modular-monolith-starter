import { Injectable } from "@nestjs/common";
import { Result, ok, err } from "neverthrow";
import { User } from "../../domain/entities/user.entity";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";

@Injectable()
export class GetUserByEmailQuery {
  constructor(private readonly repository: UsersRepository) {}

  async execute(email: string): Promise<Result<User | null, never>> {
    const result = await this.repository.findOne({ email });
    if (result.isErr()) return err(result.error);
    return ok(result.value);
  }
}
