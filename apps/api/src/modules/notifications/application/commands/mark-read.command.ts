import { Injectable, Optional } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import { DatabaseService, type TransactionError } from "../../../../infrastructure/database";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";
import { Notification } from "../../domain/entities/notification.entity";
import type { NotificationError } from "../../domain/errors/notification.errors";
import { NotificationsRepository } from "../../infrastructure/repositories/notifications.repository";

@Injectable()
export class MarkReadCommand {
  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly cache: DistributedCacheService,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(
    id: string,
    userId: string,
  ): Promise<Result<Notification, NotificationError | TransactionError>> {
    const operation = async (): Promise<Result<Notification, NotificationError>> => {
      const found = await this.notifications.findOne({ id, userId });
      if (found.isErr() || !found.value)
        return err({ type: "NOTIFICATION_NOT_FOUND", notificationId: id });
      if (!found.value.isRead) {
        const updated = await this.notifications.updateOne({ id, userId }, { readAt: new Date() });
        if (updated.isErr() || !updated.value) {
          return err({ type: "NOTIFICATION_NOT_FOUND", notificationId: id });
        }
        await this.cache.invalidateGlobal(`notifications:unread:${userId}`);
        return ok(updated.value);
      }
      return ok(found.value);
    };
    if (!this.database) return operation();
    return this.database.withResultTransaction(operation);
  }

  async markAllRead(userId: string): Promise<Result<void, NotificationError | TransactionError>> {
    try {
      await this.notifications.markAllRead(userId);
      await this.cache.invalidateGlobal(`notifications:unread:${userId}`);
      return ok(undefined);
    } catch {
      return err({ type: "TRANSACTION_FAILED" });
    }
  }
}
