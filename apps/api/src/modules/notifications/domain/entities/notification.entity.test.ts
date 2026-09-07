import { describe, it, expect } from "vitest";
import { Notification } from "./notification.entity";

describe("Notification", () => {
  describe("create", () => {
    it("should create an unread notification", () => {
      const notification = Notification.create({
        userId: "user-1",
        type: "user.welcome",
        category: "account",
        titleKey: "notifications.types.userWelcome",
        channels: ["inApp"],
      });

      expect(notification.isRead).toBe(false);
      expect(notification.id.length).toBeGreaterThan(0);
    });
  });

  describe("markRead", () => {
    it("should flip an unread notification to read", () => {
      const notification = Notification.create({
        userId: "user-1",
        type: "user.welcome",
        category: "account",
        titleKey: "notifications.types.userWelcome",
        channels: ["inApp"],
      });
      notification.markRead();

      expect(notification.isRead).toBe(true);
      expect(notification.toJSON().readAt).toBeInstanceOf(Date);
    });
  });
});
