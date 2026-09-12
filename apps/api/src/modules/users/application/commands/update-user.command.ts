import { Injectable, Optional } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ok, err, Result } from "neverthrow";
import { z } from "zod";
import { UpdateUserSchema, type AuthenticatedUser } from "@repo/contracts";
import { User } from "../../domain/entities/user.entity";
import { EmailTaken, UserForbidden, UserNotFound } from "../../domain/errors/user.errors";
import { UserUpdatedEvent } from "../../domain/events/user.events";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { GetUserByIdQuery } from "../queries/get-user-by-id.query";
import { GetUserByEmailQuery } from "../queries/get-user-by-email.query";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import type { UserEventDispatchFailed } from "../../domain/errors/user.errors";
import { DatabaseService } from "../../../../infrastructure/database";

@Injectable()
export class UpdateUserCommand {
  constructor(
    private readonly repository: UsersRepository,
    private readonly getUserById: GetUserByIdQuery,
    private readonly getUserByEmail: GetUserByEmailQuery,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: DistributedCacheService,
    private readonly outbox: OutboxService,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(
    id: string,
    data: z.infer<typeof UpdateUserSchema>,
    actor: AuthenticatedUser,
  ): Promise<Result<User, UserNotFound | EmailTaken | UserForbidden | UserEventDispatchFailed>> {
    const scoped = this.scopeToActor(id, data, actor);
    if (scoped.isErr()) return err(scoped.error);
    const operation = () => this.persist(id, scoped.value, actor);
    if (!this.database) {
      const result = await operation();
      if (result.isOk()) await this.cacheService.invalidateGlobal(`user:${id}`);
      return result;
    }
    const result = await this.database.withResultTransaction(operation);
    if (result.isErr()) {
      return result.mapErr((error) =>
        error.type === "TRANSACTION_FAILED" ? { type: "USER_EVENT_DISPATCH_FAILED" } : error,
      );
    }
    await this.cacheService.invalidateGlobal(`user:${id}`);
    return ok(result.value);
  }

  /**
   * Separate administrative user management from own-profile edits.
   * Platform admins may change any field; anyone else may only change
   * their own name. Email changes require the dedicated verification
   * flow, so self-service email updates are rejected, never stripped.
   */
  private scopeToActor(
    id: string,
    data: z.infer<typeof UpdateUserSchema>,
    actor: AuthenticatedUser,
  ): Result<z.infer<typeof UpdateUserSchema>, UserForbidden> {
    if (actor.role === "admin") return ok(data);
    if (actor.sub !== id) return err({ type: "USER_FORBIDDEN", userId: id });
    if (data.email !== undefined) return err({ type: "USER_FORBIDDEN", userId: id });
    return ok({ name: data.name });
  }

  private async persist(
    id: string,
    data: z.infer<typeof UpdateUserSchema>,
    actor: AuthenticatedUser,
  ): Promise<Result<User, UserNotFound | EmailTaken | UserEventDispatchFailed>> {
    const existing = await this.getUserById.execute(id);
    if (existing.isErr()) return err(existing.error);

    if (data.email && data.email !== existing.value.email) {
      const emailTaken = await this.getUserByEmail.execute(data.email);
      if (emailTaken.isErr()) return err(emailTaken.error);
      if (emailTaken.value) return err({ type: "EMAIL_TAKEN", email: data.email });
    }

    existing.value.update(data);
    const saved = await this.repository.updateById(existing.value.id, {
      email: existing.value.email,
      name: existing.value.name,
      role: existing.value.role,
    });
    if (saved.isErr()) return err({ type: "USER_NOT_FOUND", userId: existing.value.id });
    if (!saved.value) return err({ type: "USER_NOT_FOUND", userId: existing.value.id });

    const dispatched = await this.outbox.dispatchGlobal(
      "user.updated",
      new UserUpdatedEvent(saved.value.id, data),
    );
    if (dispatched.isErr()) return err({ type: "USER_EVENT_DISPATCH_FAILED" });
    await this.emitMutated({
      collectionName: "users",
      documentId: saved.value.id,
      action: "UPDATE",
      actorId: actor.sub,
      tenantId: undefined,
      before: { id: existing.value.id },
      after: { id: saved.value.id, email: saved.value.email, name: saved.value.name },
    });

    return ok(saved.value);
  }

  private async emitMutated(payload: Record<string, unknown>): Promise<void> {
    if (this.database) {
      await this.database.emitAfterCommit(this.eventEmitter, "database.mutated", payload);
      return;
    }
    await this.eventEmitter.emitAsync("database.mutated", payload);
  }
}
