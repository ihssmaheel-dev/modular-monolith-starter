import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { DomainEventFanoutListener } from "./domain-event-fanout.listener";
import { SendNotificationCommand } from "../commands/send-notification.command";
import { GetUserByEmailQuery } from "../../../users/application/queries/get-user-by-email.query";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { User } from "../../../users/domain/entities/user.entity";

const USER = User.fromPersistence({
  id: "user-9",
  email: "invited@example.com",
  name: "Invited",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("DomainEventFanoutListener", () => {
  let listener: DomainEventFanoutListener;
  let notify: SendNotificationCommand;
  let getUserByEmail: GetUserByEmailQuery;

  beforeEach(() => {
    notify = { execute: vi.fn().mockResolvedValue(ok({} as never)) } as never;
    getUserByEmail = { execute: vi.fn() } as never;
    const logger = { child: vi.fn().mockReturnThis() } as never as PinoLoggerService;
    listener = new DomainEventFanoutListener(notify, getUserByEmail, logger);
  });

  it("should fan out user.created to a welcome notification", async () => {
    await listener.onUserCreated({ userId: "user-1", name: "Ada" });

    expect(notify.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", type: "user.welcome" }),
    );
  });

  it("should notify existing users on invitation, skipping email (sent elsewhere)", async () => {
    vi.mocked(getUserByEmail.execute).mockResolvedValue(ok(USER));

    await listener.onInvitationCreated({
      tenantId: "tenant-1",
      organizationName: "Acme",
      email: "invited@example.com",
      token: "token-1",
    });

    expect(notify.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-9",
        type: "tenancy.invitation.received",
        channels: ["inApp", "push"],
      }),
    );
  });

  it("should skip in-app notification when the invitee has no account yet", async () => {
    vi.mocked(getUserByEmail.execute).mockResolvedValue(ok(null));

    await listener.onInvitationCreated({
      tenantId: "tenant-1",
      organizationName: "Acme",
      email: "ghost@example.com",
      token: "token-1",
    });

    expect(notify.execute).not.toHaveBeenCalled();
  });

  it("should fan out export readiness", async () => {
    await listener.onExportReady({ requestId: "dsr-1", userId: "user-1" });

    expect(notify.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", type: "privacy.export.ready" }),
    );
  });
});
