import { Injectable } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";
import type { NotificationError } from "../../domain/errors/notification.errors";
import type { Notification } from "../../domain/entities/notification.entity";
import { NotificationsRepository } from "../../infrastructure/repositories/notifications.repository";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";
import type { PaginatedResult } from "../../../../infrastructure/database";

@Injectable()
export class ListNotificationsQuery {
  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly cache: DistributedCacheService,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    page: number,
    limit: number,
  ): Promise<Result<PaginatedResult<Notification>, NotificationError>> {
    const result = await this.notifications.paginate({ userId: actor.sub }, { page, limit });
    if (result.isErr()) {
      return err({ type: "NOTIFICATION_FETCH_FAILED" });
    }
    return ok(result.value);
  }

  async unreadCount(userId: string): Promise<number> {
    const cached = this.cache.get<number>(`notifications:unread:${userId}`);
    if (typeof cached === "number") return cached;
    const count = await this.notifications.countUnread(userId);
    this.cache.set(`notifications:unread:${userId}`, count, 60);
    return count;
  }
}
