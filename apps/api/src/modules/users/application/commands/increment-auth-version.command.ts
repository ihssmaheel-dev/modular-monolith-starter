import { Injectable, Optional } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import { User } from "../../domain/entities/user.entity";
import type { UserNotFound } from "../../domain/errors/user.errors";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { DatabaseService } from "../../../../infrastructure/database";

@Injectable()
export class IncrementAuthVersionCommand {
  constructor(
    private readonly repository: UsersRepository,
    private readonly cacheService: DistributedCacheService,
    @Optional() private readonly events?: EventEmitter2,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(userId: string): Promise<Result<User, UserNotFound>> {
    const update = () => this.repository.incrementAuthVersion(userId);
    const result = this.database
      ? await this.database.withResultTransaction(update)
      : await update();
    if (result.isErr() || !result.value) {
      return err({ type: "USER_NOT_FOUND", userId });
    }
    await this.cacheService.invalidateGlobal(`user:${userId}`);
    if (this.events) {
      await this.events.emitAsync("user.auth-version.incremented", {
        userId,
        authVersion: result.value.authVersion,
      });
    }
    return ok(result.value);
  }
}
