import { Injectable, Optional } from "@nestjs/common";
import { ok, type Result } from "neverthrow";
import { env } from "../../../../config/env";
import { DatabaseService, type TransactionError } from "../../../../infrastructure/database";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";
import type { NotificationError } from "../../domain/errors/notification.errors";
import { NotificationsRepository } from "../../infrastructure/repositories/notifications.repository";

/** GDPR erasure fan-out: remove every notification artifact for a subject. Idempotent. */
@Injectable()
export class PurgeUserNotificationsCommand {
  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly cache: DistributedCacheService,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(userId: string): Promise<Result<void, NotificationError | TransactionError>> {
    const operation = async (): Promise<Result<void, NotificationError>> => {
      await this.notifications.deleteByUser(userId);
      return ok(undefined);
    };
    const result = this.database
      ? await this.database.withResultTransaction(operation)
      : await operation();
    if (result.isOk()) {
      const invalidate = () => this.cache.invalidateGlobal(`notifications:unread:${userId}`);
      if (this.database) {
        await this.database.runAfterCommit(invalidate, "notifications:purge-cache");
      } else {
        await invalidate();
      }
    }
    return result;
  }

  async purgeTenant(tenantId: string): Promise<Result<void, NotificationError | TransactionError>> {
    const operation = async (): Promise<Result<void, NotificationError>> => {
      await this.notifications.deleteByTenant(tenantId);
      if (env.TENANCY_MODE === "single") {
        await this.notifications.deleteUnscoped();
      }
      return ok(undefined);
    };
    if (!this.database) return operation();
    return this.database.withResultTransaction(operation);
  }
}
