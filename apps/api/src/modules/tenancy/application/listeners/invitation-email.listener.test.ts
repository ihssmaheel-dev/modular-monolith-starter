import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@repo/email", () => ({
  OrganizationInvitationEmail: vi.fn(() => null),
  render: vi.fn().mockResolvedValue("<html>invitation</html>"),
}));
vi.mock("../../../../config/env", () => ({ env: { CLIENT_URL: "https://app.example.com" } }));

import { render } from "@repo/email";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { QueueService } from "../../../../infrastructure/queue/queue.service";
import { InvitationCreatedEvent } from "../../domain/events/tenancy.events";
import { InvitationEmailListener } from "./invitation-email.listener";

describe("InvitationEmailListener", () => {
  let listener: InvitationEmailListener;
  let queue: QueueService;
  let logger: PinoLoggerService;

  beforeEach(() => {
    queue = { getQueue: vi.fn() } as unknown as QueueService;
    logger = { error: vi.fn() } as unknown as PinoLoggerService;
    const i18n = { t: vi.fn().mockImplementation((key: string) => key) } as unknown as I18nService;
    listener = new InvitationEmailListener(queue, i18n, logger);
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
        jobId: expect.stringMatching(/^invitation-email-[0-9a-f]{32}$/),
        removeOnComplete: { age: 691_200, count: 10_000 },
        removeOnFail: { age: 691_200, count: 10_000 },
      }),
    );
    const element = vi.mocked(render).mock.calls[0]?.[0] as
      ReactElement<{ acceptUrl?: string }> | undefined;
    expect(element?.props.acceptUrl).toBe(
      "https://app.example.com/accept-invitation?token=token%2Bwith+spaces",
    );
  });

  it("returns a retryable failure when queueing fails", async () => {
    vi.mocked(queue.getQueue).mockReturnValue({
      add: vi.fn().mockRejectedValue(new Error("redis unavailable")),
    } as never);

    const result = await listener.handle(event());

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "org-1" }),
      "Invitation queueing failed",
    );
    expect(result.isErr()).toBe(true);
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
