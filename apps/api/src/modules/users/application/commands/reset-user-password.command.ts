import { Injectable, Optional } from "@nestjs/common";

import { hash } from "@node-rs/argon2";
import { err, ok, Result } from "neverthrow";
import { User } from "../../domain/entities/user.entity";
import type { InvalidPasswordResetToken } from "../../domain/errors/user.errors";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { DatabaseService } from "../../../../infrastructure/database";

@Injectable()
export class ResetUserPasswordCommand {
  constructor(
    private readonly repository: UsersRepository,
    private readonly cacheService: DistributedCacheService,
    @Optional() private readonly events?: EventEmitter2,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(
    tokenHash: string,
    newPassword: string,
  ): Promise<Result<User, InvalidPasswordResetToken>> {
    const passwordHash = await hash(newPassword);
    const update = () => this.repository.resetPasswordByToken(tokenHash, passwordHash);
    const result = this.database
      ? await this.database.withResultTransaction(update)
      : await update();
    if (result.isErr() || !result.value) {
      return err({ type: "INVALID_PASSWORD_RESET_TOKEN" });
    }
    const updated = result.value;
    const invalidate = () => this.cacheService.invalidateGlobal(`user:${updated.id}`);
    if (this.database) await this.database.runAfterCommit(invalidate, "user:password-cache");
    else await invalidate();
    const payload = {
      userId: updated.id,
      authVersion: updated.authVersion,
    };
    if (this.events && this.database) {
      await this.database.emitAfterCommit(this.events, "user.password.reset", payload);
    } else if (this.events) await this.events.emitAsync("user.password.reset", payload);
    return ok(updated);
  }
}
