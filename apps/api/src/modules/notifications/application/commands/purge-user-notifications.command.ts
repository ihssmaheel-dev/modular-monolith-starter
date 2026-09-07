import { Injectable, Optional } from "@nestjs/common";
import { ok, type Result } from "neverthrow";
import { DatabaseService } from "../../../../infrastructure/database";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";
import type { NotificationError } from "../../domain/errors/notification.errors";
import { NotificationsRepository } from "../../infrastructure/notifications.repository";

/** GDPR erasure fan-out: remove every notification artifact for a subject. Idempotent. */
@Injectable()
export class PurgeUserNotificationsCommand {
  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly cache: DistributedCacheService,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(userId: string): Promise<Result<void, NotificationError>> {
    const operation = async (): Promise<Result<void, NotificationError>> => {
      await this.notifications.deleteByUser(userId);
      await this.cache.invalidateGlobal(`notifications:unread:${userId}`);
      return ok(undefined);
    };
    if (!this.database) return operation();
    const result = await this.database.withResultTransaction(operation);
    return result.mapErr(() => ({ type: "NOTIFICATION_SEND_FAILED" as const }));
  }

  async purgeTenant(tenantId: string): Promise<Result<void, NotificationError>> {
    await this.notifications.deleteByTenant(tenantId);
    return ok(undefined);
  }
}
