import { Injectable, Optional } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { hash } from "@node-rs/argon2";
import { randomBytes } from "crypto";
import { err, ok, Result } from "neverthrow";
import { DatabaseService, type TransactionError } from "../../../../infrastructure/database";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";
import { User } from "../../domain/entities/user.entity";
import type { UserNotFound } from "../../domain/errors/user.errors";
import { UserUpdatedEvent } from "../../domain/events/user.events";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { GetUserByIdQuery } from "../queries/get-user-by-id.query";

export const ANONYMIZED_USER_NAME = "Deleted User";

export function anonymizedEmail(userId: string): string {
  return `deleted+${userId}@deleted.local`;
}

/**
 * GDPR erasure step 1: scrub direct identifiers immediately while keeping the
 * row (and its id) so tenant-scoped foreign keys stay consistent until purge.
 * Emits `user.updated` so membership snapshots follow via MembershipUserListener.
 */
@Injectable()
export class AnonymizeUserCommand {
  constructor(
    private readonly repository: UsersRepository,
    private readonly getUserById: GetUserByIdQuery,
    private readonly cacheService: DistributedCacheService,
    @Optional() private readonly events?: EventEmitter2,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(userId: string): Promise<Result<User, UserNotFound | TransactionError>> {
    const operation = () => this.persist(userId);
    if (!this.database) return operation();
    return this.database.withResultTransaction(operation);
  }

  private async persist(userId: string): Promise<Result<User, UserNotFound>> {
    const existing = await this.getUserById.execute(userId);
    if (existing.isErr()) return err(existing.error);

    const unusableHash = await hash(randomBytes(32).toString("hex"));
    const updated = await this.repository.updateById(userId, {
      email: anonymizedEmail(userId),
      name: ANONYMIZED_USER_NAME,
      avatarFileId: null,
      passwordHash: unusableHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    });
    if (updated.isErr() || !updated.value) return err({ type: "USER_NOT_FOUND", userId });

    await this.cacheService.invalidateGlobal(`user:${userId}`);
    if (this.events) {
      await this.events.emitAsync(
        "user.updated",
        new UserUpdatedEvent(userId, {
          email: anonymizedEmail(userId),
          name: ANONYMIZED_USER_NAME,
        }),
      );
    }
    return ok(updated.value);
  }
}
