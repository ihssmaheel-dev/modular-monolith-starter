import { Injectable } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import { User } from "../../domain/entities/user.entity";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { hashSha256Token } from "../../../../infrastructure/security/token.utils";
import { DatabaseService, type TransactionError } from "../../../../infrastructure/database";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";
import { SessionService } from "../../../../infrastructure/session/session.service";
import { EventEmitter2 } from "@nestjs/event-emitter";

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
  constructor(
    private readonly repository: UsersRepository,
    private readonly database: DatabaseService,
    private readonly cache: DistributedCacheService,
    private readonly sessions: SessionService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(token: string): Promise<Result<User, InvalidEmailChangeToken | TransactionError>> {
    const user = await this.database.withResultTransaction(() =>
      this.repository.applyEmailChangeByToken(hashSha256Token(token)),
    );
    if (user.isErr()) return err(user.error);
    if (!user.value) return err({ type: "INVALID_EMAIL_CHANGE_TOKEN" });
    const updated = user.value;
    await this.database.runAfterCommit(
      () => this.cache.invalidateGlobal(`user:${updated.id}`),
      "user:email-change-cache",
    );
    await this.database.runAfterCommit(
      () => this.sessions.revokeAllForUser(updated.id),
      "user:email-change-sessions",
    );
    await this.database.emitAfterCommit(this.events, "user.auth-version.incremented", {
      userId: updated.id,
      authVersion: updated.authVersion,
    });
    return ok(updated);
  }
}
