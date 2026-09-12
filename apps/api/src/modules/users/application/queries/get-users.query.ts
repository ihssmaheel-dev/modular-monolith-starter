import { Injectable } from "@nestjs/common";
import { ok, err, Result } from "neverthrow";
import { User } from "../../domain/entities/user.entity";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { paginate } from "@repo/contracts";

@Injectable()
export class GetUsersQuery {
  constructor(private readonly repository: UsersRepository) {}

  async execute(
    page?: number,
    limit?: number,
  ): Promise<
    Result<{ users: User[]; total: number; page: number; limit: number; totalPages: number }, never>
  > {
    const { page: p, limit: l } = paginate(page, limit);
    const result = await this.repository.paginate({}, { page: p, limit: l });
    if (result.isErr()) return err(result.error);
    return ok({
      users: result.value.items,
      total: result.value.total,
      page: p,
      limit: l,
      totalPages: result.value.totalPages,
    });
  }
}
