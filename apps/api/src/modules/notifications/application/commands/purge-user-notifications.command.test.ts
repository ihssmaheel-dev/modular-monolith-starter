import { describe, it, expect, vi, beforeEach } from "vitest";
import { PurgeUserNotificationsCommand } from "./purge-user-notifications.command";
import { NotificationsRepository } from "../../infrastructure/repositories/notifications.repository";
import { DistributedCacheService } from "../../../../infrastructure/cache/distributed-cache.service";

describe("PurgeUserNotificationsCommand", () => {
  let command: PurgeUserNotificationsCommand;
  let notifications: NotificationsRepository;

  beforeEach(() => {
    notifications = {
      deleteByUser: vi.fn().mockResolvedValue(undefined),
      deleteByTenant: vi.fn().mockResolvedValue(undefined),
      deleteUnscoped: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsRepository;
    const cache = { invalidateGlobal: vi.fn() } as unknown as DistributedCacheService;
    command = new PurgeUserNotificationsCommand(notifications, cache);
  });

  it("should delete every artifact table for the subject", async () => {
    const result = await command.execute("user-1");

    expect(result.isOk()).toBe(true);
    expect(notifications.deleteByUser).toHaveBeenCalledWith("user-1");
  });

  it("should purge tenant rows and unscoped rows in single-tenant mode", async () => {
    const result = await command.purgeTenant("tenant-1");

    expect(result.isOk()).toBe(true);
    expect(notifications.deleteByTenant).toHaveBeenCalledWith("tenant-1");
    if ((process.env.TENANCY_MODE ?? "single") === "single") {
      expect(notifications.deleteUnscoped).toHaveBeenCalledTimes(1);
    }
  });
});
