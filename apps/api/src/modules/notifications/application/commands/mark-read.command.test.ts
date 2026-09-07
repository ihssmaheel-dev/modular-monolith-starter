import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { MarkReadCommand } from "./mark-read.command";
import { NotificationsRepository } from "../../infrastructure/notifications.repository";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";
import { Notification } from "../../domain/entities/notification.entity";

describe("MarkReadCommand", () => {
  let command: MarkReadCommand;
  let notifications: NotificationsRepository;
  let cache: DistributedCacheService;

  const notification = Notification.create({
    userId: "user-1",
    type: "user.welcome",
    category: "account",
    titleKey: "x",
    channels: ["inApp"],
  });

  beforeEach(() => {
    notifications = {
      findOne: vi.fn(),
      updateById: vi.fn(),
      markAllRead: vi.fn(),
    } as unknown as NotificationsRepository;
    cache = { invalidateGlobal: vi.fn() } as unknown as DistributedCacheService;
    command = new MarkReadCommand(notifications, cache);
  });

  it("should return NOTIFICATION_NOT_FOUND for another user's row", async () => {
    vi.mocked(notifications.findOne).mockResolvedValue(ok(null));

    const result = await command.execute("note-1", "user-1");

    expect(result.isErr() && result.error.type).toBe("NOTIFICATION_NOT_FOUND");
  });

  it("should mark an unread notification and invalidate the count cache", async () => {
    vi.mocked(notifications.findOne).mockResolvedValue(ok(notification));
    vi.mocked(notifications.updateById).mockResolvedValue(ok(notification));

    const result = await command.execute("note-1", "user-1");

    expect(result.isOk()).toBe(true);
    expect(cache.invalidateGlobal).toHaveBeenCalledWith("notifications:unread:user-1");
  });

  it("should mark all notifications as read", async () => {
    const result = await command.markAllRead("user-1");

    expect(result.isOk()).toBe(true);
    expect(notifications.markAllRead).toHaveBeenCalledWith("user-1");
  });

  it("should return the notification untouched when already read", async () => {
    notification.markRead();
    vi.mocked(notifications.findOne).mockResolvedValue(ok(notification));

    const result = await command.execute("note-1", "user-1");

    expect(result.isOk()).toBe(true);
    expect(notifications.updateById).not.toHaveBeenCalled();
  });

  it("should surface a missing row on update", async () => {
    const unread = Notification.create({
      userId: "user-1",
      type: "user.welcome",
      category: "account",
      titleKey: "x",
      channels: ["inApp"],
    });
    vi.mocked(notifications.findOne).mockResolvedValue(ok(unread));
    vi.mocked(notifications.updateById).mockResolvedValue(ok(null));

    const result = await command.execute("note-1", "user-1");

    expect(result.isErr() && result.error.type).toBe("NOTIFICATION_NOT_FOUND");
  });
});
