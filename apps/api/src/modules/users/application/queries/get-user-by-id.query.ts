import { Injectable, Optional } from "@nestjs/common";
import { ok, err, Result } from "neverthrow";
import { User, type UserData } from "../../domain/entities/user.entity";
import { UserNotFound } from "../../domain/errors/user.errors";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { RedisService } from "../../../../infrastructure/redis";

const USER_CACHE_TTL_SECONDS = 300;

@Injectable()
export class GetUserByIdQuery {
  constructor(
    private readonly repository: UsersRepository,
    @Optional() private readonly redis?: RedisService,
  ) {}

  async execute(id: string): Promise<Result<User, UserNotFound>> {
    const client = this.redis?.getClient();
    const cacheKey = `cache:user:${id}`;

    if (client) {
      try {
        const cached = await client.get(cacheKey);
        if (cached) {
          const data = JSON.parse(cached) as UserData;
          const user = User.fromPersistence({
            ...data,
            emailVerifiedAt: data.emailVerifiedAt ? new Date(data.emailVerifiedAt) : null,
            createdAt: new Date(data.createdAt),
            updatedAt: new Date(data.updatedAt),
          });
          return ok(user);
        }
      } catch {
        // Fail open to database when Redis lookup errors
      }
    }

    const result = await this.fetch(id);
    if (result.isOk() && client) {
      try {
        await client.set(
          cacheKey,
          JSON.stringify(result.value.toJSON()),
          "EX",
          USER_CACHE_TTL_SECONDS,
        );
      } catch {
        // Fail open if Redis caching fails
      }
    }

    return result;
  }

  /** Used by token validation and credentials verification so the latest DB state is observed immediately. */
  async executeFresh(id: string): Promise<Result<User, UserNotFound>> {
    const result = await this.fetch(id);
    const client = this.redis?.getClient();
    if (result.isOk() && client) {
      try {
        await client.set(
          `cache:user:${id}`,
          JSON.stringify(result.value.toJSON()),
          "EX",
          USER_CACHE_TTL_SECONDS,
        );
      } catch {
        // Fail open if Redis caching fails
      }
    }
    return result;
  }

  private async fetch(id: string): Promise<Result<User, UserNotFound>> {
    const result = await this.repository.findById(id);
    if (result.isErr()) return err(result.error);
    if (!result.value) return err({ type: "USER_NOT_FOUND", userId: id });
    return ok(result.value);
  }
}
