import { Injectable, Optional } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ok, err, Result } from "neverthrow";
import type { UserNotFound, UserOwnsOrganization } from "../../domain/errors/user.errors";
import { UserDeletedEvent } from "../../domain/events/user.events";
import { UsersRepository } from "../../infrastructure/users.repository";
import { GetUserByIdQuery } from "../queries/get-user-by-id.query";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";
import { CanDeleteUserQuery } from "../../../tenancy/application/queries/can-delete-user.query";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import type { UserEventDispatchFailed } from "../../domain/errors/user.errors";
import { DatabaseService } from "../../../../infrastructure/database";
import { SessionService } from "../../../../infrastructure/session/session.service";
import { IncrementAuthVersionCommand } from "./increment-auth-version.command";

@Injectable()
export class DeleteUserCommand {
  constructor(
    private readonly repository: UsersRepository,
    private readonly getUserById: GetUserByIdQuery,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: DistributedCacheService,
    private readonly outbox: OutboxService,
    @Optional() private readonly canDeleteUser?: CanDeleteUserQuery,
    @Optional() private readonly database?: DatabaseService,
    @Optional() private readonly sessions?: SessionService,
    @Optional() private readonly incrementAuthVersion?: IncrementAuthVersionCommand,
  ) {}

  async execute(
    id: string,
  ): Promise<Result<void, UserNotFound | UserOwnsOrganization | UserEventDispatchFailed>> {
    const operation = () => this.persist(id);
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

  private async persist(
    id: string,
  ): Promise<Result<void, UserNotFound | UserOwnsOrganization | UserEventDispatchFailed>> {
    const existing = await this.getUserById.execute(id);
    if (existing.isErr()) return err(existing.error);
    if (this.canDeleteUser) {
      const allowed = await this.canDeleteUser.execute(id);
      if (allowed.isErr()) return err(allowed.error);
    }

    if (this.incrementAuthVersion) await this.incrementAuthVersion.execute(id);
    if (this.sessions) await this.sessions.revokeAllForUser(id);

    const deleted = await this.repository.deleteById(id);
    if (deleted.isErr()) return err({ type: "USER_NOT_FOUND", userId: id });
    if (!deleted.value) return err({ type: "USER_NOT_FOUND", userId: id });

    const dispatched = await this.outbox.dispatchGlobal("user.deleted", new UserDeletedEvent(id));
    if (dispatched.isErr()) return err({ type: "USER_EVENT_DISPATCH_FAILED" });
    await this.emitMutated({
      collectionName: "users",
      documentId: id,
      action: "DELETE",
      actorId: id,
      tenantId: undefined,
      before: { id, email: existing.value.email },
      after: null,
    });

    return ok(undefined);
  }

  private async emitMutated(payload: Record<string, unknown>): Promise<void> {
    if (this.database) {
      await this.database.emitAfterCommit(this.eventEmitter, "database.mutated", payload);
      return;
    }
    await this.eventEmitter.emitAsync("database.mutated", payload);
  }
}
