import { Injectable } from "@nestjs/common";
import { ok, type Result } from "neverthrow";
import type { AuthenticatedUser, NotificationListResponse } from "@repo/contracts";
import type { NotificationError } from "../../domain/errors/notification.errors";
import { toNotificationResponse } from "../../presentation/notifications.mapper";
import { NotificationsRepository } from "../../infrastructure/notifications.repository";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";

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
  ): Promise<Result<NotificationListResponse, NotificationError>> {
    const result = await this.notifications.paginate({ userId: actor.sub }, { page, limit });
    if (result.isErr()) {
      return ok({ items: [], total: 0, page, limit, totalPages: 1 });
    }
    const val = result.value;
    return ok({
      items: val.items.map(toNotificationResponse),
      total: val.total,
      page: val.page,
      limit: val.limit,
      totalPages: val.totalPages,
    });
  }

  async unreadCount(userId: string): Promise<number> {
    const cached = this.cache.get<number>(`notifications:unread:${userId}`);
    if (typeof cached === "number") return cached;
    const count = await this.notifications.countUnread(userId);
    this.cache.set(`notifications:unread:${userId}`, count, 60);
    return count;
  }
}
