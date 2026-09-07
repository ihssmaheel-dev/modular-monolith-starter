import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { SendNotificationCommand } from "./send-notification.command";
import { NotificationsRepository } from "../../infrastructure/notifications.repository";
import { RealtimeService } from "../../../../infrastructure/realtime/realtime.service";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { Notification } from "../../domain/entities/notification.entity";

function preferenceRow(category = "account") {
  return {
    toJSON: () => ({
      id: "pref-1",
      userId: "user-1",
      category,
      inApp: true,
      email: false,
      push: false,
      digestCadence: "realtime",
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  };
}

describe("SendNotificationCommand", () => {
  let command: SendNotificationCommand;
  let notifications: NotificationsRepository;
  let realtime: RealtimeService;
  let outbox: OutboxService;
  let events: EventEmitter2;

  const created = Notification.create({
    userId: "user-1",
    type: "user.welcome",
    category: "account",
    titleKey: "notifications.types.userWelcome",
    channels: ["inApp"],
  });

  beforeEach(() => {
    notifications = { create: vi.fn().mockResolvedValue(ok(created)) } as never;
    const preferences = {
      findByUser: vi.fn().mockResolvedValue(ok([preferenceRow()])),
    } as never;
    const devices = { findByUser: vi.fn().mockResolvedValue(ok([])) } as never;
    const batches = {} as never;
    const getUserById = {} as never;
    realtime = { sendToUser: vi.fn() } as never;
    const email = {} as never;
    const push = { get: vi.fn() } as never;
    const i18n = { t: vi.fn((key: string) => key) } as never;
    outbox = { dispatchGlobal: vi.fn().mockResolvedValue(ok(undefined)) } as never;
    events = { emitAsync: vi.fn().mockResolvedValue([]) } as never;
    const logger = { child: vi.fn().mockReturnThis() } as never;

    command = new SendNotificationCommand(
      notifications,
      preferences,
      devices,
      batches,
      getUserById,
      realtime,
      email,
      push,
      i18n,
      outbox,
      events,
      logger,
    );
  });

  it("should reject an unknown notification type", async () => {
    const result = await command.execute({
      userId: "user-1",
      type: "nope.missing",
      titleKey: "x",
    });

    expect(result.isErr() && result.error.type).toBe("UNKNOWN_NOTIFICATION_TYPE");
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it("should persist and deliver immediate notifications to enabled channels", async () => {
    const result = await command.execute({
      userId: "user-1",
      type: "user.welcome",
      titleKey: "notifications.types.userWelcome",
    });

    expect(result.isOk()).toBe(true);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", type: "user.welcome" }),
    );
    expect(realtime.sendToUser).toHaveBeenCalledWith(
      "user-1",
      "notification.created",
      expect.objectContaining({ type: "user.welcome" }),
      undefined,
    );
    expect(outbox.dispatchGlobal).toHaveBeenCalledWith("notification.created", expect.anything());
  });

  it("should refuse when every channel is disabled", async () => {
    const prefs = {
      findByUser: vi.fn().mockResolvedValue(
        ok([
          {
            toJSON: () => ({
              id: "p",
              userId: "user-1",
              category: "account",
              inApp: false,
              email: false,
              push: false,
              digestCadence: "realtime",
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
        ]),
      ),
    };
    const cmd = new SendNotificationCommand(
      notifications,
      prefs as never,
      {} as never,
      {} as never,
      {} as never,
      realtime,
      {} as never,
      {} as never,
      { t: (k: string) => k } as never,
      outbox,
      events,
      { child: () => ({}) } as never,
    );

    const result = await cmd.execute({
      userId: "user-1",
      type: "user.welcome",
      titleKey: "x",
    });

    expect(result.isErr() && result.error.type).toBe("NOTIFICATION_SEND_FAILED");
    expect(notifications.create).not.toHaveBeenCalled();
  });
});
