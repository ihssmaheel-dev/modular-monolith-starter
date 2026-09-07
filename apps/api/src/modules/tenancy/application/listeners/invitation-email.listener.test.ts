import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import type { ReactElement } from "react";

vi.mock("@repo/email", () => ({
  OrganizationInvitationEmail: vi.fn(() => null),
  render: vi.fn().mockResolvedValue("<html>invitation</html>"),
}));
vi.mock("../../../../config/env", () => ({ env: { CLIENT_URL: "https://app.example.com" } }));

import { render } from "@repo/email";
import { EmailService } from "../../../../infrastructure/email/email.service";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { QueueService } from "../../../../infrastructure/queue/queue.service";
import { InvitationCreatedEvent } from "../../domain/events/invitation-created.event";
import { InvitationEmailListener } from "./invitation-email.listener";

describe("InvitationEmailListener", () => {
  let listener: InvitationEmailListener;
  let queue: QueueService;
  let email: EmailService;
  let logger: PinoLoggerService;

  beforeEach(() => {
    queue = { getQueue: vi.fn() } as unknown as QueueService;
    email = { send: vi.fn().mockResolvedValue(ok(undefined)) } as unknown as EmailService;
    logger = { error: vi.fn() } as unknown as PinoLoggerService;
    const i18n = { t: vi.fn().mockImplementation((key: string) => key) } as unknown as I18nService;
    listener = new InvitationEmailListener(queue, email, i18n, logger);
  });

  it("queues a rendered invitation email when the queue is available", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    vi.mocked(queue.getQueue).mockReturnValue({ add } as never);

    await listener.handle(event());

    expect(render).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledWith(
      "organization-invitation",
      expect.objectContaining({ to: "invitee@example.com", subject: "email.invitation.subject" }),
      expect.objectContaining({
        attempts: 5,
        jobId: expect.stringMatching(/^invitation-email:[0-9a-f]{32}$/),
        removeOnComplete: 100,
        removeOnFail: 1000,
      }),
    );
    const element = vi.mocked(render).mock.calls[0]?.[0] as
      ReactElement<{ acceptUrl?: string }> | undefined;
    expect(element?.props.acceptUrl).toBe(
      "https://app.example.com/accept-invitation?token=token%2Bwith+spaces",
    );
    expect(email.send).not.toHaveBeenCalled();
  });

  it("falls back to direct email when queueing fails", async () => {
    vi.mocked(queue.getQueue).mockReturnValue({
      add: vi.fn().mockRejectedValue(new Error("redis unavailable")),
    } as never);

    await listener.handle(event());

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "org-1" }),
      "Invitation queueing failed",
    );
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: "invitee@example.com" }));
  });
});

function event(): InvitationCreatedEvent {
  return new InvitationCreatedEvent(
    "org-1",
    "Acme",
    "invitee@example.com",
    "member",
    "token+with spaces",
    "en",
  );
}
